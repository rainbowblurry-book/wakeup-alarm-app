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
