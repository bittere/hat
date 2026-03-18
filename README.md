# Hat

A free, local, fast image compressor for Linux, Windows and Mac. Built with AI, guided by a human.

<video src="https://github.com/user-attachments/assets/f0711607-edcc-472d-9271-bed59159b483" alt="Demonstating Hat's automatic compression" title="Demonstating Hat's automatic compression"></video>
In this demo, I copied a downloaded Unsplash image to a folder being watched by Hat. Hat detected the new file and automatically compressed it according to the compression settings I had configured in the app. Hat then sent me a system notification (can be turned off) after successfully compressing the image.

## Why?

In the time it takes for you to:

1. Open an online image compression website
2. Upload your (presumably large) image
3. Run into file size limits/"Please Sign Up" popups
4. Wait for the server to ~steal your data~ compress your image
5. Download it

...Hat's already done compressing your entire life's worth* of photos

_*hyperbole_

## How?

1. Hat runs locally on your computer. Nothing is ever uploaded anywhere
2. Your downloads folder is automatically being watched for new images
3. As a new image arrives, Hat compresses it with a (configurable) compression effort level
4. The original image is untouched and a new compressed version is saved
5. Statistics about the compression are updated in the app

Hat runs in the background when you close the window. To close Hat, go to your system tray and `Quit` Hat from there; or click the <img width="18" alt="Power Button" src="https://github.com/user-attachments/assets/84c6821d-1301-4f06-b331-83a11441ef75" /> button in the app.

No accounts, no uploads. Everything is processed by `libvips` locally.

Hat will always remain 100% free.

## What can I do with Hat?

- Watch folders automatically
- Convert between file formats
- Adjust compression quality settings
- Drag-and-drop images to compress them

## Count me in!

Hat is a toy project, but tries to solve a serious need. Hat will always be experimenting with different things. While Hat is not exactly _stable_ right now (ie. some things might be missing/might go wrong), it still should work ~90% of the time. If you find an issue, please [file it](https://github.com/bittere/hat/issues/new/choose).

You can grab the latest version of Hat from the [latest Release page](https://github.com/bittere/hat/releases/latest).

Note: Though the file name might say something like `hat-0.1.0(...)`, this is still the correct file for the version you have downloaded. For example, if you go to the `v0.5.6` release and download a binary from there, though the file name is `hat-0.1.0(...)`, it is still the correct binary for the `v0.5.6` version.

## Got a problem?

File an [issue](https://github.com/bittere/hat/issues/new/choose)!

## What's with the name?

I wanted to build a `tauri` app.
Originally, I was thinking of an open-source version of [cap](https://cap.so/).
Turns out, that was too ambitious, and instead Hat pivoted to become an image compression program.
