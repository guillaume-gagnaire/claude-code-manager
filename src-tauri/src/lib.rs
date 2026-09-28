mod agent;
mod claude;
mod commands;
mod conv;
mod core;
#[cfg(test)]
mod core_tests;
mod editor;
mod git;
mod hub;
mod job;
mod model;
mod notify;
mod paths;
mod pricing;
#[cfg(test)]
mod process_tests;
mod pty;
mod stats;
mod usage;

use crate::core::Core;
use std::io::Write;
use std::sync::atomic::Ordering;
use std::sync::Arc;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};
use tauri_plugin_window_state::StateFlags;

struct FileLogger {
    file: parking_lot::Mutex<std::fs::File>,
}

impl log::Log for FileLogger {
    fn enabled(&self, m: &log::Metadata) -> bool {
        m.level() <= log::Level::Info || (cfg!(debug_assertions) && m.target().starts_with("ccm"))
    }

    fn log(&self, r: &log::Record) {
        if self.enabled(r.metadata()) {
            let line = format!(
                "{} {:<5} {}\n",
                chrono::Local::now().format("%Y-%m-%d %H:%M:%S"),
                r.level(),
                r.args()
            );
            let _ = self.file.lock().write_all(line.as_bytes());
            #[cfg(debug_assertions)]
            eprint!("{line}");
        }
    }

    fn flush(&self) {}
}

fn init_logging() {
    let data = paths::DataDir::new(paths::default_data_dir());
    let _ = data.ensure();
    let path = data.log_file();
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > 5_000_000) {
        let _ = std::fs::rename(&path, path.with_extension("old.log"));
    }
    if let Ok(file) = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        let logger = Box::leak(Box::new(FileLogger {
            file: parking_lot::Mutex::new(file),
        }));
        if log::set_logger(logger).is_ok() {
            log::set_max_level(log::LevelFilter::Debug);
        }
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Afficher", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quitter", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Claude Code Manager")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => notify::show_main(app),
            "quit" => {
                app.state::<Arc<Core>>().shutdown();
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                notify::show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn run() {
    let mut builder = tauri::Builder::default();
    // Sandboxed runs (CCM_DATA_DIR: end-to-end tests, demos) must not hand over to an instance
    // the user already has open.
    if std::env::var_os("CCM_DATA_DIR").is_none() {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            notify::show_main(app)
        }));
    }
    builder
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::all() & !StateFlags::VISIBLE)
                .build(),
        )
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            init_logging();
            log::info!(
                "Claude Code Manager {} starting",
                app.package_info().version
            );
            let (core, git_rx) = Core::load(
                app.handle().clone(),
                paths::DataDir::new(paths::default_data_dir()),
            );
            app.manage(core.clone());
            build_tray(app)?;
            core.start(git_rx);
            if let Some(w) = app.get_webview_window("main") {
                let _ = w.show();
                let _ = w.set_focus();
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                let core = window.state::<Arc<Core>>();
                if !core.quitting.load(Ordering::Acquire) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::subscribe,
            commands::set_ui,
            commands::save_settings,
            commands::inspect_folder,
            commands::create_project,
            commands::update_project,
            commands::reorder_projects,
            commands::remove_project,
            commands::create_agent,
            commands::warm_agent,
            commands::get_conversation,
            commands::send_message,
            commands::interrupt,
            commands::answer_question,
            commands::answer_permission,
            commands::set_agent_options,
            commands::rename_agent,
            commands::archive_agent,
            commands::delete_agent,
            commands::merge_agent,
            commands::get_commands,
            commands::file_suggestions,
            commands::git_files,
            commands::git_diff,
            commands::git_log,
            commands::git_show,
            commands::stats,
            commands::refresh_usage,
            commands::open_in_editor,
            commands::term_spawn,
            commands::term_write,
            commands::term_resize,
            commands::term_kill,
            commands::play_chime,
            commands::quit_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building the application")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(core) = app.try_state::<Arc<Core>>() {
                    if !core.quitting.load(Ordering::Acquire) {
                        core.shutdown();
                    }
                }
            }
        });
}
