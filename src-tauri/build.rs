use std::env;

fn main() {
    // Get target triple
    let target = env::var("TARGET").unwrap_or_else(|_| {
        // Fallback for build script not being run with proper env
        "x86_64-pc-windows-gnu".to_string()
    });

    // Log the target for debugging
    println!("cargo:warning=Build target: {}", target);

    // Tauri build
    tauri_build::build()
}
