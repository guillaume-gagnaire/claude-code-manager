//! Token / cost statistics of the agents launched by the app (SQLite).

use crate::agent::TurnRow;
use crate::model::now_ms;
use chrono::{Datelike, Duration, Local, Months, NaiveDate, TimeZone};
use parking_lot::Mutex;
use rusqlite::{params, Connection};
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;

const SCHEMA: &str = "
PRAGMA journal_mode=WAL;
PRAGMA synchronous=NORMAL;
CREATE TABLE IF NOT EXISTS turns (
  id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, agent_id TEXT NOT NULL, project_id TEXT NOT NULL,
  model TEXT NOT NULL, input INTEGER NOT NULL, cache INTEGER NOT NULL, output INTEGER NOT NULL, cost REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS turns_ts ON turns(ts);
CREATE TABLE IF NOT EXISTS prompts (
  id INTEGER PRIMARY KEY, ts INTEGER NOT NULL, agent_id TEXT NOT NULL, project_id TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS prompts_ts ON prompts(ts);
";

pub struct Stats {
    conn: Mutex<Option<Connection>>,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Bucket {
    pub label: String,
    pub start: i64,
    pub input: u64,
    pub cache: u64,
    pub output: u64,
    pub cost: f64,
    pub prompts: u64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct Share {
    pub key: String,
    pub tokens: u64,
    pub cost: f64,
}

#[derive(Debug, Clone, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct StatsView {
    pub range: String,
    pub buckets: Vec<Bucket>,
    pub tokens: u64,
    pub tokens_prev: u64,
    pub cost: f64,
    pub cost_all: f64,
    pub first_ts: Option<i64>,
    pub prompts: u64,
    pub by_project: Vec<Share>,
    pub by_model: Vec<Share>,
}

impl Stats {
    pub fn open(path: &Path) -> Self {
        let conn = Connection::open(path).and_then(|c| c.execute_batch(SCHEMA).map(|_| c));
        match conn {
            Ok(c) => Self {
                conn: Mutex::new(Some(c)),
            },
            Err(e) => {
                log::error!("stats database unavailable: {e}");
                Self {
                    conn: Mutex::new(None),
                }
            }
        }
    }

    #[cfg(test)]
    fn memory() -> Self {
        let c = Connection::open_in_memory().unwrap();
        c.execute_batch(SCHEMA).unwrap();
        Self {
            conn: Mutex::new(Some(c)),
        }
    }

    pub fn record_turns(&self, agent_id: &str, project_id: &str, rows: &[TurnRow]) {
        self.record_turns_at(now_ms(), agent_id, project_id, rows);
    }

    fn record_turns_at(&self, ts: i64, agent_id: &str, project_id: &str, rows: &[TurnRow]) {
        let guard = self.conn.lock();
        let Some(c) = guard.as_ref() else { return };
        for r in rows {
            let res = c.execute(
                "INSERT INTO turns (ts, agent_id, project_id, model, input, cache, output, cost) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)",
                params![ts, agent_id, project_id, r.model, r.input as i64, r.cache as i64, r.output as i64, r.cost],
            );
            if let Err(e) = res {
                log::warn!("stats insert failed: {e}");
            }
        }
    }

    pub fn record_prompt(&self, agent_id: &str, project_id: &str) {
        let guard = self.conn.lock();
        if let Some(c) = guard.as_ref() {
            let _ = c.execute(
                "INSERT INTO prompts (ts, agent_id, project_id) VALUES (?1,?2,?3)",
                params![now_ms(), agent_id, project_id],
            );
        }
    }

    pub fn today_cost(&self) -> f64 {
        let start = local_ms(Local::now().date_naive());
        let guard = self.conn.lock();
        let Some(c) = guard.as_ref() else { return 0.0 };
        c.query_row(
            "SELECT COALESCE(SUM(cost),0) FROM turns WHERE ts >= ?1",
            [start],
            |r| r.get(0),
        )
        .unwrap_or(0.0)
    }

    pub fn query(&self, range: &str) -> StatsView {
        self.query_at(range, Local::now().date_naive())
    }

    fn query_at(&self, range: &str, today: NaiveDate) -> StatsView {
        let (starts, labels, prev_start) = bucket_bounds(range, today);
        let end = match range {
            "week" => local_ms(*starts.last().unwrap() + Duration::weeks(1)),
            "month" => local_ms(*starts.last().unwrap() + Months::new(1)),
            _ => local_ms(today + Duration::days(1)),
        };
        let bounds: Vec<i64> = starts.iter().map(|d| local_ms(*d)).collect();
        let first = bounds[0];
        let prev = local_ms(prev_start);
        let mut view = StatsView {
            range: range.to_string(),
            buckets: bounds
                .iter()
                .zip(labels)
                .map(|(s, l)| Bucket {
                    label: l,
                    start: *s,
                    ..Default::default()
                })
                .collect(),
            ..Default::default()
        };
        let guard = self.conn.lock();
        let Some(c) = guard.as_ref() else { return view };

        let (mut by_project, mut by_model): (HashMap<String, Share>, HashMap<String, Share>) =
            Default::default();
        if let Ok(mut stmt) = c.prepare("SELECT ts, project_id, model, input, cache, output, cost FROM turns WHERE ts >= ?1 AND ts < ?2") {
            let rows = stmt.query_map([prev, end], |r| {
                Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?, r.get::<_, String>(2)?, r.get::<_, i64>(3)?, r.get::<_, i64>(4)?, r.get::<_, i64>(5)?, r.get::<_, f64>(6)?))
            });
            for (ts, project, model, input, cache, output, cost) in rows.into_iter().flatten().flatten() {
                let tokens = (input + cache + output) as u64;
                if ts < first {
                    view.tokens_prev += tokens;
                    continue;
                }
                let i = bounds.partition_point(|b| *b <= ts).saturating_sub(1);
                let b = &mut view.buckets[i];
                b.input += input as u64;
                b.cache += cache as u64;
                b.output += output as u64;
                b.cost += cost;
                view.tokens += tokens;
                view.cost += cost;
                for (map, key) in [(&mut by_project, project), (&mut by_model, model)] {
                    let s = map.entry(key.clone()).or_insert_with(|| Share { key, ..Default::default() });
                    s.tokens += tokens;
                    s.cost += cost;
                }
            }
        }
        if let Ok(mut stmt) = c.prepare("SELECT ts FROM prompts WHERE ts >= ?1 AND ts < ?2") {
            let rows = stmt.query_map([first, end], |r| r.get::<_, i64>(0));
            for ts in rows.into_iter().flatten().flatten() {
                let i = bounds.partition_point(|b| *b <= ts).saturating_sub(1);
                view.buckets[i].prompts += 1;
                view.prompts += 1;
            }
        }
        let (cost_all, first_ts): (f64, Option<i64>) = c
            .query_row(
                "SELECT COALESCE(SUM(cost),0), MIN(ts) FROM turns",
                [],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .unwrap_or((0.0, None));
        view.cost_all = cost_all;
        view.first_ts = first_ts;
        let sort = |m: HashMap<String, Share>| {
            let mut v: Vec<Share> = m.into_values().collect();
            v.sort_by(|a, b| b.tokens.cmp(&a.tokens));
            v
        };
        view.by_project = sort(by_project);
        view.by_model = sort(by_model);
        view
    }
}

fn local_ms(d: NaiveDate) -> i64 {
    let naive = d.and_hms_opt(0, 0, 0).expect("midnight");
    Local
        .from_local_datetime(&naive)
        .earliest()
        .map(|t| t.timestamp_millis())
        .unwrap_or_else(|| naive.and_utc().timestamp_millis())
}

const MONTHS: [&str; 12] = [
    "janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.",
    "déc.",
];

/// Bucket start dates, labels and the start of the previous (comparison) period.
fn bucket_bounds(range: &str, today: NaiveDate) -> (Vec<NaiveDate>, Vec<String>, NaiveDate) {
    match range {
        "week" => {
            let monday = today - Duration::days(today.weekday().num_days_from_monday() as i64);
            let starts: Vec<NaiveDate> =
                (0..12).map(|i| monday - Duration::weeks(11 - i)).collect();
            let labels = starts
                .iter()
                .map(|d| format!("S{}", d.iso_week().week()))
                .collect();
            let prev = starts[0] - Duration::weeks(12);
            (starts, labels, prev)
        }
        "month" => {
            let first = today.with_day(1).expect("first of month");
            let starts: Vec<NaiveDate> = (0..12).map(|i| first - Months::new(11 - i)).collect();
            let labels = starts
                .iter()
                .map(|d| MONTHS[d.month0() as usize].to_string())
                .collect();
            let prev = starts[0] - Months::new(12);
            (starts, labels, prev)
        }
        _ => {
            let starts: Vec<NaiveDate> = (0..14).map(|i| today - Duration::days(13 - i)).collect();
            let labels = starts
                .iter()
                .map(|d| format!("{:02}/{:02}", d.day(), d.month()))
                .collect();
            let prev = starts[0] - Duration::days(14);
            (starts, labels, prev)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(model: &str, input: u64, cost: f64) -> TurnRow {
        TurnRow {
            model: model.into(),
            input,
            cache: 100,
            output: 10,
            cost,
        }
    }

    #[test]
    fn buckets_and_shares() {
        let s = Stats::memory();
        let today = NaiveDate::from_ymd_opt(2026, 9, 27).unwrap();
        let noon = |d: NaiveDate| local_ms(d) + 12 * 3600 * 1000;
        s.record_turns_at(noon(today), "a1", "p1", &[row("claude-opus-5-5", 50, 1.0)]);
        s.record_turns_at(
            noon(today - Duration::days(2)),
            "a2",
            "p2",
            &[row("claude-sonnet-5", 20, 0.25)],
        );
        s.record_turns_at(
            noon(today - Duration::days(20)),
            "a2",
            "p2",
            &[row("claude-sonnet-5", 5, 0.1)],
        );
        let v = s.query_at("day", today);
        assert_eq!(v.buckets.len(), 14);
        assert_eq!(v.buckets[13].label, "27/09");
        assert_eq!(v.buckets[13].input, 50);
        assert_eq!(v.buckets[11].input, 20);
        assert_eq!(v.tokens, 160 + 130);
        assert_eq!(v.tokens_prev, 115);
        assert!((v.cost - 1.25).abs() < 1e-9);
        assert!((v.cost_all - 1.35).abs() < 1e-9);
        assert_eq!(v.by_project[0].key, "p1");
        assert_eq!(v.by_model.len(), 2);

        let m = s.query_at("month", today);
        assert_eq!(m.buckets.last().unwrap().label, "sept.");
        assert_eq!(m.buckets[0].label, "oct.");
        let w = s.query_at("week", today);
        assert_eq!(w.buckets.len(), 12);
    }
}
