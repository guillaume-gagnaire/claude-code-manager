//! Single event channel towards the webview.

use crate::model::UiEvent;
use parking_lot::RwLock;
use tauri::ipc::Channel;

#[derive(Default)]
pub struct Hub {
    channel: RwLock<Option<Channel<UiEvent>>>,
}

impl Hub {
    pub fn set_channel(&self, channel: Channel<UiEvent>) {
        *self.channel.write() = Some(channel);
    }

    pub fn emit(&self, event: UiEvent) {
        if let Some(ch) = &*self.channel.read() {
            if let Err(e) = ch.send(event) {
                log::debug!("event channel send failed: {e}");
            }
        }
    }
}
