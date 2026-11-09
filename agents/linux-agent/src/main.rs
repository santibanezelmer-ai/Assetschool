use serde::Serialize;

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
            "Linux Rust nativo. Servidor gráfico detectado: {}.",
            if is_wayland { "Wayland (Portal pipewire)" } else { "X11 (XShm / XTest)" }
        ),
    }
}

#[tokio::main]
async fn main() {
    println!("==================================================");
    println!(" AssetSchool Native Agent — Linux (Rust)");
    println!(" Fase 01: Fundación de Arquitectura y Protocolo");
    println!("==================================================");

    let caps = get_linux_capabilities("pending-enrollment");
    if let Ok(json) = serde_json::to_string_pretty(&caps) {
        println!("[INFO] Capacidades Nativas Registradas:");
        println!("{}", json);
    }
}
