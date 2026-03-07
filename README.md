# Hat

A free, local, fast image compressor for Linux, Windows and Mac.

<insert demo here once I'm free>

## Why?

In the time it takes for you to:

1. Open an online image compression website
2. Upload your (presumably large) image
3. Run into file size limits/"Please Sign Up" popups
4. Wait for the server ~to steal your data~ compress your image
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

## Count me in!

Note: Hat is currently being rewritten from scratch. Right now, you can grab the **latest preview version** of Hat from the [Releases](https://github.com/bittere/hat/releases). This version may be missing some features.

If you'd instead like a more _solid/stable_ version of Hat, head over to the [latest stable release](https://github.com/bittere/hat/releases/latest), grab the binary for your computer and install it. This version will mostly work and has most of the advertised features, but might look/function differently.

## Got a problem?

File an issue!

## What's with the name?

I wanted to build a `tauri` app.
Originally, I was thinking of an open-source version of [cap](https://cap.so/).
Turns out, that was too ambitious, and instead Hat pivoted to become an image compression program.
