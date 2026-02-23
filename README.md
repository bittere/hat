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

Hat runs in the background when you close the window. To close Hat, go to your system tray and `Quit` Hat from there.

No accounts, no uploads. Everything is processed by `libvips` locally.

Hat will always remain 100% free.

## Count me in!

Head over to the [latest release](https://github.com/bittere/hat/releases/latest), grab the binary for your computer, install it, and you're done.

## Got a problem?

File an issue!

## What's with the name?

I wanted to build a `tauri` app.
Originally, I was thinking of an open-source version of [cap](https://cap.so/).
Turns out, that was too ambitious, and instead Hat pivoted to become an image compression program.
