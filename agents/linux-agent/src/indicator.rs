/// Visual indicator on student screen to comply with strict anti-spyware rules.
pub struct CaptureIndicator {
    is_visible: bool,
}

impl CaptureIndicator {
    pub fn new() -> Self {
        Self { is_visible: false }
    }

    pub fn show(&mut self, teacher_name: &str) {
        self.is_visible = true;
        println!("==========================================================================");
        println!("[AVISO DE PRIVACIDAD LINUX] 🔴 Tu pantalla está siendo supervisada por {}.", teacher_name);
        println!("[AVISO DE PRIVACIDAD LINUX] AssetSchool LAN Classroom Monitor — Transmisión activa.");
        println!("==========================================================================");
    }

    pub fn hide(&mut self) {
        if !self.is_visible {
            return;
        }
        self.is_visible = false;
        println!("[AVISO DE PRIVACIDAD LINUX] 🟢 Supervisión finalizada. Notificación cerrada.");
    }
}
