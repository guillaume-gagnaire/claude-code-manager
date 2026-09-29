//! What the running Claude processes cost the machine: memory and CPU, per agent and in all.

use crate::job::JobUsage;
use serde::Serialize;
use std::collections::HashMap;
use std::time::{Duration, Instant};

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentResources {
    pub id: String,
    /// Bytes.
    pub memory: u64,
    /// Share of the whole machine, in percent.
    pub cpu: f64,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Resources {
    /// Running Claude processes.
    pub instances: u32,
    pub memory: u64,
    pub cpu: f64,
    pub agents: Vec<AgentResources>,
}

/// Share of the whole machine (every core) that `used` CPU time is over `elapsed`, in percent.
pub fn cpu_percent(used: Duration, elapsed: Duration, cores: usize) -> f64 {
    let capacity = elapsed.as_secs_f64() * cores.max(1) as f64;
    if capacity <= 0.0 {
        return 0.0;
    }
    (used.as_secs_f64() / capacity * 100.0).clamp(0.0, 100.0)
}

/// Turns the CPU times of successive samples into percentages.
#[derive(Default)]
pub struct Sampler {
    last: HashMap<String, (Duration, Instant)>,
}

impl Sampler {
    /// `usages`: each running agent's process tree.
    pub fn sample(
        &mut self,
        now: Instant,
        cores: usize,
        usages: Vec<(String, JobUsage)>,
    ) -> Resources {
        let mut last = HashMap::new();
        let mut out = Resources::default();
        for (id, u) in usages {
            // A process that restarted has less CPU time than the one before: start over.
            let cpu = match self.last.get(&id) {
                Some(&(cpu, at)) if u.cpu >= cpu => cpu_percent(u.cpu - cpu, now - at, cores),
                _ => 0.0,
            };
            last.insert(id.clone(), (u.cpu, now));
            out.instances += 1;
            out.memory += u.memory;
            out.cpu += cpu;
            out.agents.push(AgentResources {
                id,
                memory: u.memory,
                cpu,
            });
        }
        self.last = last;
        out.cpu = out.cpu.min(100.0);
        out
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const S: Duration = Duration::from_secs(1);

    #[test]
    fn cpu_is_a_share_of_every_core() {
        assert_eq!(cpu_percent(S, 2 * S, 4), 12.5);
        assert_eq!(cpu_percent(4 * S, S, 4), 100.0);
        // Rounding between two samples cannot go past the machine.
        assert_eq!(cpu_percent(5 * S, S, 4), 100.0);
        assert_eq!(cpu_percent(S, Duration::ZERO, 4), 0.0);
    }

    fn usage(cpu_ms: u64, memory: u64) -> JobUsage {
        JobUsage {
            cpu: Duration::from_millis(cpu_ms),
            memory,
            processes: 1,
        }
    }

    #[test]
    fn adds_up_the_agents_with_their_cpu_since_the_last_sample() {
        let mut s = Sampler::default();
        let t0 = Instant::now();
        let first = s.sample(
            t0,
            2,
            vec![("a".into(), usage(3000, 100)), ("b".into(), usage(0, 50))],
        );
        // Nothing to compare the CPU time with yet.
        assert_eq!(first.instances, 2);
        assert_eq!(first.memory, 150);
        assert_eq!(first.cpu, 0.0);

        let next = s.sample(
            t0 + S,
            2,
            vec![("a".into(), usage(3500, 120)), ("b".into(), usage(200, 50))],
        );
        assert_eq!(
            next,
            Resources {
                instances: 2,
                memory: 170,
                cpu: 35.0,
                agents: vec![
                    AgentResources {
                        id: "a".into(),
                        memory: 120,
                        cpu: 25.0
                    },
                    AgentResources {
                        id: "b".into(),
                        memory: 50,
                        cpu: 10.0
                    },
                ],
            }
        );
    }

    #[test]
    fn the_total_stays_within_the_machine() {
        // Each agent's share is measured on its own: rounded, they can add up past 100 %.
        let mut s = Sampler::default();
        let t0 = Instant::now();
        s.sample(
            t0,
            1,
            vec![("a".into(), usage(0, 1)), ("b".into(), usage(0, 1))],
        );
        let r = s.sample(
            t0 + S,
            1,
            vec![("a".into(), usage(600, 1)), ("b".into(), usage(600, 1))],
        );
        assert_eq!(r.cpu, 100.0);
    }

    #[test]
    fn forgets_a_process_that_stopped() {
        let mut s = Sampler::default();
        let t0 = Instant::now();
        s.sample(t0, 1, vec![("a".into(), usage(1000, 10))]);
        assert_eq!(s.sample(t0 + S, 1, vec![]), Resources::default());
        // A new process of the same agent starts from its own CPU time.
        let again = s.sample(t0 + 2 * S, 1, vec![("a".into(), usage(100, 10))]);
        assert_eq!(again.cpu, 0.0);
    }
}
