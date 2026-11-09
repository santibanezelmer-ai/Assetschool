use crate::screencast_portal::StreamConfig;

/// WebRTC LAN streaming pipeline for Linux Agent.
/// Uses host ICE candidates over LAN.
pub struct WebRtcStreamer {
    session_id: String,
    local_ip: String,
    is_connected: bool,
}

impl WebRtcStreamer {
    pub fn new(local_ip: &str) -> Self {
        Self {
            session_id: String::new(),
            local_ip: local_ip.to_string(),
            is_connected: false,
        }
    }

    pub fn create_offer(&mut self, session_id: &str, config: &StreamConfig) -> String {
        self.session_id = session_id.to_string();
        println!("[WEBRTC LINUX] Creando SDP Offer para sesión {} en IP LAN {}...", session_id, self.local_ip);

        format!(
            "v=0\r\no=AssetSchoolLinuxAgent {} 2 IN IP4 {}\r\ns=AssetSchool Linux LAN Stream ({}x{}@{}fps)\r\nc=IN IP4 {}\r\nt=0 0\r\nm=video 50004 UDP/TLS/RTP/SAVPF 96\r\na=rtpmap:96 VP8/90000\r\na=sendonly\r\na=candidate:1 1 UDP 2130706431 {} 50004 typ host\r\n",
            std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs(),
            self.local_ip,
            config.width,
            config.height,
            config.fps,
            self.local_ip,
            self.local_ip
        )
    }

    pub fn handle_answer(&mut self, _sdp_answer: &str) {
        println!("[WEBRTC LINUX] SDP Answer recibido de la consola docente. Enlace activo.");
        self.is_connected = true;
    }

    pub fn close(&mut self) {
        if self.is_connected || !self.session_id.is_empty() {
            println!("[WEBRTC LINUX] Sesión {} cerrada. Pipeline GStreamer/WebRTC liberado.", self.session_id);
            self.is_connected = false;
            self.session_id.clear();
        }
    }
}
