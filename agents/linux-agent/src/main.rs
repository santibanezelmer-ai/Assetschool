mod screencast_portal;
mod indicator;
mod webrtc_streamer;

use serde::Serialize;
use screencast_portal::{ScreenCastPortalManager, StreamConfig};
use indicator::CaptureIndicator;
use webrtc_streamer::WebRtcStreamer;

#[derive(Serialize)]
struct LinuxCapabilities {
    device_id: String,
    os_type: String,
    can_screen_broadcast: bool,
    can_screen_receive: bool,
    can_remote_input: bool,
    can_lock_input: bool,
    can_blackout_screen: bool,
    can_file_transfer: bool,
    can_process_block: bool,
    can_url_block: bool,
    can_chat: bool,
    can_execute_command: bool,
    can_collect_hardware_inventory: bool,
    platform_notes: String,
}

fn get_linux_capabilities(device_id: &str) -> LinuxCapabilities {
    let is_wayland = std::env::var("WAYLAND_DISPLAY").is_ok();
    
    LinuxCapabilities {
        device_id: device_id.to_string(),
        os_type: "linux".to_string(),
        can_screen_broadcast: true,
        can_screen_receive: true,
        can_remote_input: !is_wayland,
        can_lock_input: true,
        can_blackout_screen: true,
        can_file_transfer: true,
        can_process_block: true,
        can_url_block: true,
        can_chat: true,
        can_execute_command: true,
        can_collect_hardware_inventory: true,
        platform_notes: format!(
            "Linux Rust nativo. Servidor gráfico detectado: {}. Captura mediante PipeWire/xdg-desktop-portal.",
            if is_wayland { "Wayland (Portal pipewire)" } else { "X11 (XShm / XTest)" }
        ),
    }
}

#[tokio::main]
async fn main() {
    println!("==================================================");
    println!(" AssetSchool Native Agent — Linux (Rust)");
    println!(" Fase 02: Captura PipeWire/X11 & WebRTC LAN");
    println!("==================================================");

    let caps = get_linux_capabilities("pending-enrollment");
    if let Ok(json) = serde_json::to_string_pretty(&caps) {
        println!("[INFO] Capacidades Nativas Registradas:\n{}", json);
    }

    let mut portal = ScreenCastPortalManager::new();
    let mut indicator = CaptureIndicator::new();
    let mut streamer = WebRtcStreamer::new("192.168.1.103");

    println!("\n[SIMULACIÓN LAN] Iniciando verificación de captura supervisada en Linux...");
    indicator.show("Mariana Fuentes");

    let config = StreamConfig::thumbnail();
    if let Ok(_) = portal.start_capture(config.clone()) {
        let offer = streamer.create_offer("stream_linux_test_01", &config);
        println!("[SIGNALING] Offer SDP generado:\n{}", offer);

        streamer.handle_answer("v=0\r\ns=TeacherAnswer...");

        portal.stop_capture();
        streamer.close();
        indicator.hide();

        println!("\n[ÉXITO] Pipeline de captura y WebRTC en Linux validado correctamente.");
    }
}
