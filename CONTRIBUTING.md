> [!NOTE]  
> This document is WIP.

# General Guidelines

- If you have a new feature you want to develop, **create an issue first.** This allows discussion on how the feature should look/work, etc.
- Minimize use of outdated/old/unmaintained dependencies. Unless there's a really good use case, PRs with unmaintained dependencies won't be merged

# Working on the frontend (UI)

- Try to maximise the use of preexisting [coss ui components](https://coss.com/ui/docs) throughout the project
- In the **rare cases** that you do need to create a new component, try to use [coss ui primitives (particles)](https://coss.com/ui/particles)
- Ensure that all code is properly formatted with `2 spaces`
- There should be **no TypeScript errors** anywhere. <br />If there _is_ an error but you want it to be ignored, specify that clearly in the commit/PR description
- Any UI additions **must** include support for both light and dark mode, plus any other variants (eg. `destructive`, `outline`, etc. as required)

# Working on the backend (Rust/Tauri)

- Any code additions/modifications **must** be available on at least `win32-x64`, `linux-x64`, `darwin-x64` and `darwin-arm64`. This list may change as Hat builds are made available for other platforms as well
- Test out a build of your changes at least on `windows` and `linux`. Hat support on `mac/darwin` is limited as I myself do not have the required hardware

## Working on the compression part

- Show real benchmarks both with _your_ changes and with _existing_ Hat code; don't blindly say `this library/algorithm is faster`
- Compression _ratio_ is not the only thing users need: compression _quality_ also matters. <br /> For example, many `png` compression algorithms caused some desaturation with color quantization. That's low compression quality but high compression ratio $\implies$ unacceptable
- Hat is a realtime compressor. Images are compressed as they arrive. Compression should not only be good, but also **fast**
- Configurable compression is a good thing to have: users should be able to trade-off between speed and compression ratio/computational requirements
