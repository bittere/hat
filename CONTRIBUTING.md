> [!NOTE]  
> This document is WIP.

# General Guidelines

- If you have a new feature you want to develop, **create an issue first.** This allows discussion on how the feature should look/work, etc.
- Minimize use of outdated/old/unmaintained dependencies. Unless there's a really good use case, PRs with unmaintained dependencies won't be merged
- You _can_ use AI if you want. However, you then take full responsibility of the code (as if you yourself had written it). You cannot later blame the AI for an issue/bug

# Working on the design

- Hat strives to have a simple, clean interface
- If you have a design idea/suggestion, create an issue first. This allows others to get involved too
- Show at least a basic proof-of-concept of how the design would look like. Even a wireframe works, but a Figma design would be much appreciated

# Working on the frontend (UI)

- Try to maximise the use of preexisting [coss ui components](https://coss.com/ui/docs) throughout the project
- In the **rare cases** that you do need to create a new component, try to use [coss ui primitives (particles)](https://coss.com/ui/particles)
- Ensure that all code is properly formatted with `2 spaces`
- There should be **no TypeScript errors** anywhere. <br />If there _is_ an error but you want it to be ignored, specify that clearly in the commit/PR description
- Any UI additions **must** include support for both light and dark mode. For example, if you add a new `FancyButton` component, include at least light and dark mode variants. Any additional variants eg. destructive, outline, etc. would be appreciated but not required

# Working on the backend (Rust/Tauri)

- Any code additions/modifications **must** compile on at least `win32-x64`, `linux-x64`, `darwin-x64` and `darwin-arm64`. This list may change as Hat builds are made available for other platforms as well
- Test out a build of your changes at least on `windows` and `linux`. Hat support on `mac/darwin` is limited as I myself do not have the required hardware

## Working on the compression part

- Show real benchmarks both with _your_ changes and with _existing_ Hat code; don't blindly say `this library/algorithm is faster`
- Compression _ratio_ is not the only thing users need: compression _quality_ also matters. <br /> For example, many `png` compression algorithms caused some desaturation with color quantization. That's low compression quality but high compression ratio $\implies$ unacceptable
- Hat is a realtime compressor. Images are compressed as they arrive. Compression should not only be good, but also **fast**
- Configurable compression is a good thing to have: users should be able to trade-off between speed and compression ratio/computational requirements
- If the library you use provides additional configuration options eg. `png` filters, etc., make sure to include those in the Settings dialog in the frontend as well.
