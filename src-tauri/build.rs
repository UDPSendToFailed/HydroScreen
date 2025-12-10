fn main() {
    let windows_attributes = tauri_build::WindowsAttributes::new()
        .app_manifest(include_str!("app.manifest"));

    tauri_build::try_build(
        tauri_build::Attributes::new().windows_attributes(windows_attributes)
    ).expect("failed to run build script");
}