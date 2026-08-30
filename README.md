# WakeUp!!

## What it is
A barcode-disarm alarm app…

## Main user flow
1. Choose an alarm time.
2. Set a wake item barcode.
3. Create a snooze code.
4. Arm the alarm.
5. Scan the item to fully dismiss it.

## Features
- Native time picker
- Repeat-day schedule
- Barcode scanner
- PIN snooze
- Chimes/default alarm sound
- Themes
- Cruelty mode
- Local AsyncStorage persistence

## Screens
- Alarm
- Setup
- Settings
- Ringing
- Snoozing
- Scanner

## Technical stack
- React Native
- Expo
- expo-camera
- expo-av
- AsyncStorage
- expo-keep-awake
- DateTimePicker

## Current limitations
- One alarm only
- Alarm needs app open during Expo Go testing
- Remote sounds require internet
- Background alarm scheduling is not implemented yet

## Future work
- Build APK with EAS
- Native scheduled notifications/alarm support
- Multiple alarms
- Local bundled audio
- User wallpaper support

# Sample Snack app

Open the `App.js` file to start writing some code. You can preview the changes directly on your phone or tablet by scanning the **QR code** or use the iOS or Android emulators. When you're done, click **Save** and share the link!

When you're ready to see everything that Expo provides (or if you want to use your own editor) you can **Download** your project and use it with [expo cli](https://docs.expo.dev/get-started/installation/#expo-cli)).

All projects created in Snack are publicly available, so you can easily share the link to this project via link, or embed it on a web page with the `<>` button.

If you're having problems, you can tweet to us [@expo](https://twitter.com/expo) or ask in our [forums](https://forums.expo.dev/c/expo-dev-tools/61) or [Discord](https://chat.expo.dev/).

Snack is Open Source. You can find the code on the [GitHub repo](https://github.com/expo/snack).
