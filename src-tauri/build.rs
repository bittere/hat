use std::env;
use std::path::PathBuf;

fn main() {
    let target = env::var("TARGET").unwrap();
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").unwrap());

    // 1. Locate Binaries
    let lib_dir = manifest_dir.join("binaries").join(&target);
    if !lib_dir.exists() {
        println!("cargo:warning=libvips binaries not found at {}", lib_dir.display());
        println!("cargo:warning=Please run: bun scripts/setup-libvips.ts");
        // Don't panic here; allow build to proceed in case system libs are present, 
        // though it might fail at runtime if not configured.
    } else {
        println!("cargo:rustc-link-search=native={}", lib_dir.display());

        // 2. Link Libraries
        // Note: For Linux/macOS, "vips" is usually sufficient (libvips.so / libvips.dylib)
        // For Windows, it might be "vips-42" depending on the sharp package version.
        if target.contains("windows") {
             println!("cargo:rustc-link-lib=vips-42");
             println!("cargo:rustc-link-lib=glib-2.0");
             println!("cargo:rustc-link-lib=gobject-2.0");
        } else {
             println!("cargo:rustc-link-lib=vips");
             println!("cargo:rustc-link-lib=glib-2.0");
             println!("cargo:rustc-link-lib=gobject-2.0");
        }
    }

    // 3. Re-run script if folders change
    println!("cargo:rerun-if-changed=binaries");
    println!("cargo:rerun-if-changed=include");
    
    tauri_build::build()
}