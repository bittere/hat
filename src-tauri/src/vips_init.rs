use log::{info, warn};
use std::sync::Mutex;
use std::sync::Once;

static VIPS_INIT: Once = Once::new();
static mut VIPS_INITIALIZED: bool = false;
static VIPS_LOCK: Mutex<()> = Mutex::new(());

/// Initialize libvips once at application startup
pub fn init_vips() {
    VIPS_INIT.call_once(|| {
        if let Ok(_guard) = VIPS_LOCK.lock() {
            match rs_vips::Vips::init("hat") {
                Ok(_) => {
                    unsafe {
                        VIPS_INITIALIZED = true;
                    }
                    info!("libvips initialized successfully");
                }
                Err(e) => {
                    warn!("Failed to initialize libvips: {}", e);
                }
            }
        }
    });
}

/// Shutdown libvips (called on app exit)
pub fn shutdown_vips() {
    unsafe {
        if VIPS_INITIALIZED {
            rs_vips::Vips::shutdown();
            VIPS_INITIALIZED = false;
            info!("libvips shutdown");
        }
    }
}

/// Check if vips is initialized
#[allow(dead_code)]
pub fn is_initialized() -> bool {
    unsafe { VIPS_INITIALIZED }
}
