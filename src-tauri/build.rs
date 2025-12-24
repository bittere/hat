use std::env;
use std::path::PathBuf;

fn main() {
    // Get target triple
    let target = env::var("TARGET").unwrap_or_else(|_| {
        // Fallback for build script not being run with proper env
        "x86_64-pc-windows-gnu".to_string()
    });

    // Log the target for debugging
    println!("cargo:warning=Build target: {}", target);

    // Set library search path for bundled libvips
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());
    let lib_dir = manifest_dir.join("binaries").join(&target);

    if lib_dir.exists() {
        println!("cargo:warning=Using libvips from: {}", lib_dir.display());
        println!("cargo:rustc-link-search=native={}", lib_dir.display());

        // Detect platform and link appropriate library
        if target.contains("windows") {
            // Windows: link vips-42.dll or libvips.lib
            if lib_dir.join("libvips-42.dll").exists() {
                println!("cargo:rustc-link-lib=dylib=vips-42");
            } else if lib_dir.join("vips-42.lib").exists() {
                println!("cargo:rustc-link-lib=static=vips-42");
            } else {
                println!("cargo:warning=Warning: vips library not found in {}", lib_dir.display());
            }
        } else if target.contains("apple") {
            // macOS: link libvips.dylib or libvips.a
            println!("cargo:rustc-link-lib=dylib=vips");
        } else if target.contains("linux") {
            // Linux: link libvips.so or libvips.a
            println!("cargo:rustc-link-lib=dylib=vips");
        }
    } else {
        println!("cargo:warning=libvips binaries directory not found at {}", lib_dir.display());
        println!("cargo:warning=Run: bun run setup-libvips");
    }

    // Tell vips-sys to skip pkg-config and use our bundled libs
    env::set_var("VIPS_NO_PKG_CONFIG", "1");

    // Point to include directory for bindgen
    let include_dir = manifest_dir.join("include");
    if include_dir.exists() {
        env::set_var("CFLAGS", format!("-I{}", include_dir.display()));
    }

    // Tauri build
    tauri_build::build()
}
