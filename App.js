import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  SafeAreaView,
  ImageBackground,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  Vibration,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Feather } from '@expo/vector-icons';
import DateTimePicker, {
  DateTimePickerAndroid,
} from '@react-native-community/datetimepicker';

const { width } = Dimensions.get('window');

const SETTINGS_KEY = 'wakeup_settings_v4';
const MIN_SNOOZE_SECONDS = 20;
const PREVIEW_DURATION_MS = 2500;
const DEFAULT_SOUND = 'chimes';
const DEFAULT_THEME = 'minimal';
const DAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// These remote files are suitable for testing in Expo Go. Before relying on the
// app as a real daily alarm, replace them with local bundled .mp3 files so a
// missing internet connection cannot stop the alarm sound from loading.
const SOUND_PROFILES = {
  chimes: {
  name: 'Chimes',
  source: require('./assets/sounds/glass-at-daybreaks.mp3'),
},
  radar: {
    name: 'Radar',
    uri: 'https://actions.google.com/sounds/v1/alarms/beep_short.ogg',
  },
  dinnerBell: {
    name: 'Dinner Bell',
    uri: 'https://actions.google.com/sounds/v1/alarms/dinner_bell_triangle.ogg',
  },
  softClock: {
    name: 'Soft Clock',
    uri: 'https://actions.google.com/sounds/v1/alarms/mechanical_clock_ring.ogg',
  },
};

// -----------------------------------------------------------------------------
// THEME SETTINGS
// Edit colors, roundness, and optional wallpaper here — this is the one place
// for the visual design.
//
// TO ADD A WALLPAPER:
// 1. In Snack, upload a PNG/JPG into the Assets area and give it a clear name.
// 2. Replace `wallpaper: null` below with this kind of line:
//      wallpaper: require('./assets/sunrise-bg.png'),
//    The folder/name must exactly match your uploaded file.
// 3. If you are unsure, leave wallpaper: null. The app will use a color
//    background and cannot crash because an image was not added.
// -----------------------------------------------------------------------------
const THEMES = {
  minimal: {
    label: 'Minimal',
    bg: '#0E0E12',
    armedBg: '#000000',
    ringBg: '#3A0E14',
    snoozeBg: '#241A08',
    surface: '#17171D',
    surfaceAlt: '#202027',
    border: 'rgba(255,255,255,0.10)',
    text: '#F5F5F7',
    muted: '#A1A1AA',
    accent: '#6C5CE7',
    accentText: '#FFFFFF',
    radius: 16,
    largeRadius: 22,
    wallpaper: null,
  },
  cute: {
    label: 'Cute',
    bg: '#FFF0F6',
    armedBg: '#2B0F1F',
    ringBg: '#5D1738',
    snoozeBg: '#5A3A12',
    surface: '#FFFFFF',
    surfaceAlt: '#FFF7FB',
    border: '#FFD3E6',
    text: '#5A2140',
    muted: '#A63B75',
    accent: '#F65E9A',
    accentText: '#FFFFFF',
    radius: 26,
    largeRadius: 32,
    wallpaper: null,
  },
  sunrise: {
    label: 'Sunrise',
    bg: '#FFE9D6',
    armedBg: '#2A1B12',
    ringBg: '#6E2518',
    snoozeBg: '#5A3A12',
    surface: '#FFF7EE',
    surfaceAlt: '#FFF0E0',
    border: '#FFD0A0',
    text: '#5C3620',
    muted: '#A85F2C',
    accent: '#F57C31',
    accentText: '#FFFFFF',
    radius: 20,
    largeRadius: 26,
    wallpaper: require('./assets/bkgd.png'),
  },
};

function getTimeParts(timeString) {
  const [hoursText, minutesText] = String(timeString || '').split(':');
  const rawHours = Number(hoursText);
  const rawMinutes = Number(minutesText);

  // Number.isFinite keeps 0 valid. Never use `rawHours || 7` here:
  // JavaScript treats 0 as false, which caused the old 00 -> 07 / 00 -> 30 bug.
  const hours =
    Number.isFinite(rawHours) && rawHours >= 0 && rawHours <= 23 ? rawHours : 7;
  const minutes =
    Number.isFinite(rawMinutes) && rawMinutes >= 0 && rawMinutes <= 59
      ? rawMinutes
      : 30;

  return { hours, minutes };
}

function formatTimeForDisplay(timeString) {
  const { hours, minutes } = getTimeParts(timeString);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);

  // Native locale formatting automatically respects the user's device setting.
  // A 24-hour phone shows 07:00; a 12-hour phone shows 7:00 AM.
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatNowForDisplay(date) {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function formatDuration(minutes) {
  if (!Number.isFinite(minutes)) return '';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

export default function App() {
  // App navigation and runtime state.
  const [activeTab, setActiveTab] = useState('alarm');
  const [appMode, setAppMode] = useState('standby'); // standby | armed | ringing | snoozed
  const [isEditingPin, setIsEditingPin] = useState(false);
  const [now, setNow] = useState(new Date());
  const [minsUntilAlarm, setMinsUntilAlarm] = useState(null);

  // Saved settings.
  const [targetBarcode, setTargetBarcode] = useState('');
  const [savedPin, setSavedPin] = useState('');
  const [alarmTime, setAlarmTime] = useState('07:30'); // Always stored safely as HH:MM (24-hour)
  const [repeatDays, setRepeatDays] = useState([]);
  const [soundProfile, setSoundProfile] = useState(DEFAULT_SOUND);
  const [snoozeDuration, setSnoozeDuration] = useState(5);
  const [crueltyMode, setCrueltyMode] = useState(false);
  const [themeKey, setThemeKey] = useState(DEFAULT_THEME);

  // Alarm interaction state.
  const [enteredPin, setEnteredPin] = useState('');
  const [snoozeEndsAt, setSnoozeEndsAt] = useState(null);
  const [crueltySeconds, setCrueltySeconds] = useState(null);
  const [showKeypad, setShowKeypad] = useState(false);
  const [snoozeTimeRemaining, setSnoozeTimeRemaining] = useState('');

  // Native time picker state.
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState(() => {
    const date = new Date();
    date.setHours(7, 30, 0, 0);
    return date;
  });

  // Scanner state.
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerPurpose, setScannerPurpose] = useState(''); // setup | disarm

  const activeSoundRef = useRef(null);
  const previewTimeoutRef = useRef(null);
  const lastFiredKey = useRef(null);
  const scanLockedRef = useRef(false);

  const theme = THEMES[themeKey] || THEMES[DEFAULT_THEME];
  const isArmed = appMode === 'armed';
  const isRinging = appMode === 'ringing';
  const isSnoozed = appMode === 'snoozed';

  // Runs once: restore settings and keep the displayed clock current.
  // The cleanup here also covers the case where the alarm is ringing when
  // the component unmounts (e.g. Fast Refresh during development): without
  // this, a looping Vibration.vibrate(..., true) call has no other owner
  // and would keep repeating after the screen is gone.
  useEffect(() => {
    loadSettings();
    const clockTimer = setInterval(() => setNow(new Date()), 1000);

    return () => {
      clearInterval(clockTimer);
      stopAudio();
      Vibration.cancel();
    };
  }, []);

  // Alarm schedule check. It only runs when armed.
  useEffect(() => {
    // Always calculate the next alarm countdown.
    // This makes the main screen show "Rings at ... in ..."
    // even before the user has armed the alarm.
    setMinsUntilAlarm(calculateMinutesUntilAlarm());

    // Only trigger sound/vibration after the user explicitly arms the alarm.
    if (!isArmed) return;

    const { hours, minutes } = getTimeParts(alarmTime);
    const currentHours = now.getHours();
    const currentMinutes = now.getMinutes();
    const currentDay = now.getDay();

    const fireKey =
      `${now.toDateString()}-` +
      `${String(currentHours).padStart(2, '0')}:` +
      `${String(currentMinutes).padStart(2, '0')}`;

    const dayAllowed =
      repeatDays.length === 0 || repeatDays.includes(currentDay);

    if (
      dayAllowed &&
      currentHours === hours &&
      currentMinutes === minutes &&
      lastFiredKey.current !== fireKey
    ) {
      lastFiredKey.current = fireKey;
      triggerRing();
    }
  }, [now, isArmed, alarmTime, repeatDays]);

  // Snooze countdown and re-ring handling.
  useEffect(() => {
    if (!isSnoozed || !snoozeEndsAt) return undefined;

    const snoozeTimer = setInterval(() => {
      const secondsLeft = Math.max(
        0,
        Math.ceil((snoozeEndsAt - Date.now()) / 1000)
      );
      if (secondsLeft <= 0) {
        clearInterval(snoozeTimer);
        triggerRing();
        return;
      }
      const minutes = Math.floor(secondsLeft / 60);
      const seconds = String(secondsLeft % 60).padStart(2, '0');
      setSnoozeTimeRemaining(`${minutes}:${seconds}`);
    }, 500);

    return () => clearInterval(snoozeTimer);
  }, [isSnoozed, snoozeEndsAt]);

  const loadSettings = async () => {
    try {
      const raw = await AsyncStorage.getItem(SETTINGS_KEY);
      if (!raw) return;

      const parsed = JSON.parse(raw);
      if (typeof parsed.targetBarcode === 'string')
        setTargetBarcode(parsed.targetBarcode);
      if (typeof parsed.savedPin === 'string') setSavedPin(parsed.savedPin);
      if (typeof parsed.alarmTime === 'string') setAlarmTime(parsed.alarmTime);
      if (Array.isArray(parsed.repeatDays))
        setRepeatDays(
          parsed.repeatDays.filter(
            (day) => Number.isInteger(day) && day >= 0 && day <= 6
          )
        );
      if (parsed.soundProfile && SOUND_PROFILES[parsed.soundProfile])
        setSoundProfile(parsed.soundProfile);
      if (Number.isFinite(parsed.snoozeDuration))
        setSnoozeDuration(Math.max(1, Math.min(15, parsed.snoozeDuration)));
      if (typeof parsed.crueltyMode === 'boolean')
        setCrueltyMode(parsed.crueltyMode);
      if (parsed.themeKey && THEMES[parsed.themeKey])
        setThemeKey(parsed.themeKey);
    } catch (error) {
      console.warn('Could not restore settings:', error);
    }
  };

  const saveSettings = async (changes) => {
    try {
      const next = {
        targetBarcode,
        savedPin,
        alarmTime,
        repeatDays,
        soundProfile,
        snoozeDuration,
        crueltyMode,
        themeKey,
        ...changes,
      };
      await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    } catch (error) {
      console.warn('Could not save settings:', error);
    }
  };

  const calculateMinutesUntilAlarm = () => {
    const { hours, minutes } = getTimeParts(alarmTime);
    const current = new Date();

    for (let daysAhead = 0; daysAhead <= 7; daysAhead += 1) {
      const candidate = new Date(current);
      candidate.setDate(candidate.getDate() + daysAhead);
      candidate.setHours(hours, minutes, 0, 0);

      if (candidate <= current) continue;
      if (repeatDays.length === 0 && daysAhead > 0) continue;
      if (repeatDays.length > 0 && !repeatDays.includes(candidate.getDay()))
        continue;

      return Math.round((candidate.getTime() - current.getTime()) / 60000);
    }

    return null;
  };

  // expo-av is deprecated and was removed in Expo SDK 55, so playback uses
  // expo-audio's imperative createAudioPlayer(). We use the factory function
  // (not the useAudioPlayer hook) because the alarm needs to swap sources at
  // runtime (different sound profiles, preview vs. full ring) rather than
  // load one fixed source at mount. Each player we create here is released
  // manually in stopAudio, since createAudioPlayer does not auto-release.
  const stopAudio = async () => {
    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current);
      previewTimeoutRef.current = null;
    }

    const player = activeSoundRef.current;
    activeSoundRef.current = null;

    if (!player) return;

    try {
      player.pause();
      player.remove();
    } catch (error) {
      // A player may already have been released. It is safe to ignore.
    }
  };

  const startAudio = async (profileId) => {
    const profile = SOUND_PROFILES[profileId] || SOUND_PROFILES[DEFAULT_SOUND];

    await stopAudio();

    try {
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: true,
        interruptionMode: 'doNotMix',
      });
      const source = profile.source ?? {
  uri: profile.uri,
  updateInterval: 500,
};

const player = createAudioPlayer(source);
      player.loop = true;
      player.volume = 1.0;

      activeSoundRef.current = player;
      player.play();
    } catch (error) {
      console.warn('Could not start alarm audio:', error);
      Alert.alert(
        'Sound unavailable',
        'This sound could not load. Choose another sound in Settings.'
      );
    }
  };

  const previewAudio = async (profileId) => {
    await startAudio(profileId);
    previewTimeoutRef.current = setTimeout(() => {
      stopAudio();
    }, PREVIEW_DURATION_MS);
  };

  const savePickedTime = (selectedDate) => {
    if (!selectedDate) return;

    const hours = selectedDate.getHours();
    const minutes = selectedDate.getMinutes();

    // This creates a safe 24-hour storage string.
    // Examples:
    // 00:00 stays "00:00"
    // 07:00 stays "07:00"
    // 19:45 stays "19:45"
    const newTime =
      `${String(hours).padStart(2, '0')}:` +
      `${String(minutes).padStart(2, '0')}`;

    setAlarmTime(newTime);
    saveSettings({ alarmTime: newTime });
  };

  const openTimePicker = () => {
    const { hours, minutes } = getTimeParts(alarmTime);

    const initialDate = new Date();
    initialDate.setHours(hours, minutes, 0, 0);

    // Android: open the real system round clock dialog.
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: initialDate,
        mode: 'time',
        is24Hour: undefined,
        onChange: (event, selectedDate) => {
          // "dismissed" means the user pressed Cancel/back.
          if (event.type === 'dismissed' || !selectedDate) return;

          // "set" means the user pressed Android's OK button.
          if (event.type === 'set') {
            savePickedTime(selectedDate);
          }
        },
      });

      return;
    }

    // iPhone/iPad: show the inline native picker.
    setPickerDate(initialDate);
    setShowTimePicker(true);
  };

  const toggleRepeatDay = (dayIndex) => {
    const nextDays = repeatDays.includes(dayIndex)
      ? repeatDays.filter((day) => day !== dayIndex)
      : [...repeatDays, dayIndex].sort((a, b) => a - b);

    setRepeatDays(nextDays);
    saveSettings({ repeatDays: nextDays });
  };

  // Pure check, kept separate from toggleArm's side effects so the arming
  // requirements can be read (or unit tested) without touching state/alerts.
  const getArmBlockReason = () => {
    if (!targetBarcode) return 'Please set a wake item in Setup first.';
    if (savedPin.length !== 10)
      return 'Please set a 10-digit snooze code in Setup first.';
    return null;
  };

  const toggleArm = async () => {
    if (!isArmed) {
      const blockReason = getArmBlockReason();
      if (blockReason) {
        Alert.alert('Setup required', blockReason);
        setActiveTab('setup');
        return;
      }

      lastFiredKey.current = null;
      setMinsUntilAlarm(calculateMinutesUntilAlarm());
      setAppMode('armed');

      try {
        await activateKeepAwakeAsync();
      } catch (error) {
        console.warn('Could not enable keep-awake:', error);
      }
      return;
    }

    setAppMode('standby');
    try {
      await deactivateKeepAwake();
    } catch (error) {
      console.warn('Could not disable keep-awake:', error);
    }
  };

  const triggerRing = async () => {
    setAppMode('ringing');
    setSnoozeEndsAt(null);
    setCrueltySeconds(snoozeDuration * 60);
    setEnteredPin('');
    setShowKeypad(false);

    startAudio(soundProfile);
    Vibration.vibrate([400, 200, 400, 200, 400], true);

    try {
      await activateKeepAwakeAsync();
    } catch (error) {
      console.warn('Could not enable keep-awake:', error);
    }
  };

  const fullyDisarm = async (method) => {
    setAppMode('standby');
    setSnoozeEndsAt(null);
    setShowKeypad(false);
    Vibration.cancel();
    await stopAudio();

    try {
      await deactivateKeepAwake();
    } catch (error) {
      console.warn('Could not disable keep-awake:', error);
    }

    // `method` currently only has one caller ('Wake Item Scan'), but is kept
    // as a parameter so future disarm paths (e.g. NFC tag, QR code) can pass
    // their own label without changing this function's signature.
    const detail =
      method === 'Wake Item Scan'
        ? 'Alarm off. Have a great morning!'
        : 'Alarm off.';

    Alert.alert('You did it! ☀️', detail);
  };

  const acceptSnooze = () => {
    const defaultSeconds = snoozeDuration * 60;
    const seconds = crueltyMode
      ? Math.max(
          MIN_SNOOZE_SECONDS,
          Math.floor((crueltySeconds || defaultSeconds) / 2)
        )
      : defaultSeconds;

    if (crueltyMode) setCrueltySeconds(seconds);

    setAppMode('snoozed');
    setSnoozeEndsAt(Date.now() + seconds * 1000);
    setSnoozeTimeRemaining(
      `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
    );
    setShowKeypad(false);
    Vibration.cancel();
    stopAudio();
  };

  const submitPin = () => {
    if (enteredPin === savedPin) {
      acceptSnooze();
      return;
    }

    Alert.alert('Incorrect code', 'Try again.');
    setEnteredPin('');
  };

  const openScanner = async (purpose) => {
    if (!cameraPermission?.granted) {
      const permissionResult = await requestCameraPermission();
      if (!permissionResult.granted) {
        Alert.alert(
          'Camera permission needed',
          'Camera access is required to scan your wake item.'
        );
        return;
      }
    }

    scanLockedRef.current = false;
    setScannerPurpose(purpose);
    setIsScannerOpen(true);
  };

  const handleScan = ({ data }) => {
    // Camera can fire many barcode events per second. Lock after the first result
    // so duplicate events cannot save/disarm repeatedly.
    if (scanLockedRef.current) return;

    if (scannerPurpose === 'setup') {
      scanLockedRef.current = true;
      setTargetBarcode(data);
      saveSettings({ targetBarcode: data });
      setIsScannerOpen(false);
      Alert.alert('Wake item saved', `Barcode: ${data}`);
      return;
    }

    if (scannerPurpose === 'disarm' && data === targetBarcode) {
      scanLockedRef.current = true;
      setIsScannerOpen(false);
      fullyDisarm('Wake Item Scan');
    }
  };

  const renderSchedule = () => (
    <View style={[styles.card, themedCard(theme)]}>
      <Text style={[styles.cardHeader, { color: theme.muted }]}>SCHEDULE</Text>

      <TouchableOpacity
        style={[
          styles.timeButton,
          {
            backgroundColor: theme.surfaceAlt,
            borderColor: theme.border,
            borderRadius: theme.radius,
          },
        ]}
        onPress={openTimePicker}
        accessibilityRole="button"
        accessibilityLabel={`Alarm time ${formatTimeForDisplay(
          alarmTime
        )}. Tap to change.`}>
        <Feather name="clock" size={22} color={theme.accent} />
        <View style={styles.timeButtonTextWrap}>
          <Text style={[styles.timeButtonValue, { color: theme.text }]}>
            {formatTimeForDisplay(alarmTime)}
          </Text>
          <Text style={[styles.timeButtonHint, { color: theme.muted }]}>
            Tap to choose alarm time
          </Text>
        </View>
        <Feather name="chevron-right" size={22} color={theme.muted} />
      </TouchableOpacity>

      {Platform.OS === 'ios' && showTimePicker && (
        <View
          style={[
            styles.nativePickerWrap,
            {
              backgroundColor: theme.surfaceAlt,
              borderColor: theme.border,
              borderRadius: theme.radius,
            },
          ]}>
          <DateTimePicker
            value={pickerDate}
            mode="time"
            display="spinner"
            onChange={(event, selectedDate) => {
              if (selectedDate) {
                setPickerDate(selectedDate);
                savePickedTime(selectedDate);
              }
            }}
          />

          <TouchableOpacity
            style={[
              styles.doneTimeButton,
              {
                backgroundColor: theme.accent,
                borderRadius: theme.radius,
              },
            ]}
            onPress={() => setShowTimePicker(false)}
            accessibilityRole="button"
            accessibilityLabel="Done choosing alarm time">
            <Text style={[styles.doneTimeText, { color: theme.accentText }]}>
              DONE
            </Text>
          </TouchableOpacity>
        </View>
      )}

      <Text style={[styles.repeatLabel, { color: theme.muted }]}>
        Repeat on
      </Text>
      <View style={styles.dayRow}>
        {DAY_LABELS.map((day, index) => {
          const selected = repeatDays.includes(index);
          return (
            <TouchableOpacity
              key={day}
              style={[
                styles.dayChip,
                {
                  backgroundColor: selected ? theme.accent : theme.surfaceAlt,
                  borderColor: selected ? theme.accent : theme.border,
                  borderRadius: theme.largeRadius,
                },
              ]}
              onPress={() => toggleRepeatDay(index)}
              accessibilityRole="button"
              accessibilityLabel={`Repeat on ${day}`}
              accessibilityState={{ selected }}>
              <Text
                style={{
                  color: selected ? theme.accentText : theme.muted,
                  fontSize: 12,
                  fontWeight: '800',
                }}>
                {day}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );

  const renderAlarmTab = () => (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.tabContent}
      keyboardShouldPersistTaps="handled">
      <Text
        style={[
          styles.missionLabel,
          { color: isArmed ? '#F5B54C' : theme.accent },
        ]}>
        {isArmed ? 'MISSION ARMED' : 'STANDING BY'}
      </Text>

      <View style={styles.clockWrap}>
        <Text
          style={[
            styles.clockTime,
            { color: isArmed ? '#F5B54C' : theme.text },
          ]}>
          {formatNowForDisplay(now)}
        </Text>
        <Text
          style={[styles.clockSub, { color: theme.muted }]}
          accessibilityLiveRegion="polite">
          {minsUntilAlarm !== null
            ? `Rings at ${formatTimeForDisplay(
                alarmTime
              )} · in ${formatDuration(minsUntilAlarm)}`
            : 'Choose at least one future alarm day.'}
        </Text>
      </View>

      <TouchableOpacity
        style={[
          styles.primaryAction,
          {
            backgroundColor: isArmed ? theme.surface : theme.accent,
            borderColor: isArmed ? theme.border : theme.accent,
            borderRadius: theme.largeRadius,
          },
        ]}
        onPress={toggleArm}
        accessibilityRole="button"
        accessibilityLabel={isArmed ? 'Cancel alarm' : 'Set alarm'}>
        <Text
          style={{
            color: isArmed ? theme.text : theme.accentText,
            fontSize: 16,
            fontWeight: '900',
            letterSpacing: 1,
          }}>
          {isArmed ? 'CANCEL ALARM' : 'SET ALARM'}
        </Text>
      </TouchableOpacity>

      {renderSchedule()}
    </ScrollView>
  );

    const renderSetupTab = () => (
  <KeyboardAvoidingView
    style={styles.flex}
    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
  >
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.tabContent}
      keyboardShouldPersistTaps="handled"
    >
      {/* ================================================================
          1. WAKE ITEM
          This card lets the user scan/change the physical barcode item.
          Changing the item does NOT delete or change the snooze code.
         ================================================================ */}
      <View style={[styles.card, themedCard(theme)]}>
        <Text style={[styles.cardHeader, { color: theme.muted }]}>
          YOUR WAKE MISSION
        </Text>

        <Text style={[styles.cardDesc, { color: theme.muted }]}>
          Choose a barcode or QR code on an item you must physically reach to turn off your alarm.
        </Text>

        <View style={styles.row}>
          <Text style={[styles.rowLabel, { color: theme.text }]}>
            {targetBarcode ? 'Wake item ready' : 'No wake item set'}
          </Text>

          <TouchableOpacity
            style={[
              styles.secondaryAction,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
                borderRadius: theme.largeRadius,
              },
            ]}
            onPress={() => openScanner('setup')}
            accessibilityRole="button"
            accessibilityLabel="Scan wake item"
          >
            <Text
              style={[
                styles.secondaryActionText,
                { color: theme.text },
              ]}
            >
              {targetBarcode ? 'Change wake item' : 'Set wake item'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ================================================================
          2. SNOOZE CODE
          - No saved code: show the 10-digit input.
          - Saved 10-digit code: hide the input and show "Change".
          - Pressing Change: reveal the input again.
         ================================================================ */}
      <View style={[styles.card, themedCard(theme)]}>
        <View style={styles.cardHeaderRow}>
          <Text
            style={[
              styles.cardHeader,
              { color: theme.muted, marginBottom: 0 },
            ]}
          >
            SNOOZE CODE
          </Text>

          {savedPin.length === 10 && !isEditingPin && (
            <Text
              style={{
                color: theme.accent,
                fontWeight: '900',
                fontSize: 12,
                letterSpacing: 0.5,
              }}
            >
              ✓ SET
            </Text>
          )}
        </View>

        {savedPin.length === 10 && !isEditingPin ? (
          <>
            <Text
              style={[
                styles.cardDesc,
                { color: theme.muted, marginBottom: 14 },
              ]}
            >
              Your 10-digit snooze code is saved. You only need to change it
              if you want a different code.
            </Text>

            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>
                Code saved securely
              </Text>

              <TouchableOpacity
                style={[
                  styles.secondaryAction,
                  {
                    backgroundColor: theme.surfaceAlt,
                    borderColor: theme.border,
                    borderRadius: theme.largeRadius,
                  },
                ]}
                onPress={() => setIsEditingPin(true)}
                accessibilityRole="button"
                accessibilityLabel="Change snooze code"
              >
                <Text
                  style={[
                    styles.secondaryActionText,
                    { color: theme.text },
                  ]}
                >
                  Change
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            <Text style={[styles.cardDesc, { color: theme.muted }]}>
              Choose one 10-digit code. It snoozes the alarm; it never turns
              the alarm off.
            </Text>

            <TextInput
              style={[
                styles.pinInput,
                {
                  color: theme.text,
                  backgroundColor: theme.surfaceAlt,
                  borderColor:
                    savedPin.length === 10
                      ? theme.accent
                      : theme.border,
                  borderRadius: theme.radius,
                },
              ]}
              value={savedPin}
              onChangeText={(value) => {
                const cleaned = value
                  .replace(/[^0-9]/g, '')
                  .slice(0, 10);

                setSavedPin(cleaned);
                saveSettings({ savedPin: cleaned });

                // Hide the keyboard/input immediately after all 10 digits.
                if (cleaned.length === 10) {
                  setIsEditingPin(false);
                }
              }}
              keyboardType="number-pad"
              maxLength={10}
              placeholder="Enter 10 digits"
              placeholderTextColor={theme.muted}
              secureTextEntry
              returnKeyType="done"
              accessibilityLabel="Ten digit snooze code"
              autoFocus={isEditingPin}
            />

            {isEditingPin && (
              <TouchableOpacity
                style={styles.cancelPinButton}
                onPress={() => {
                  // If a complete previous code exists, leave edit mode.
                  // If the current entry is incomplete, keep the user here.
                  if (savedPin.length === 10) {
                    setIsEditingPin(false);
                  } else {
                    Alert.alert(
                      'Code incomplete',
                      'Enter all 10 digits before saving the snooze code.'
                    );
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel="Cancel changing snooze code"
              >
                <Text
                  style={[
                    styles.cancelPinText,
                    { color: theme.muted },
                  ]}
                >
                  Cancel
                </Text>
              </TouchableOpacity>
            )}
          </>
        )}
      </View>

      {/* ================================================================
          3. TESTING NOTE
         ================================================================ */}
      <View style={[styles.card, themedCard(theme)]}>
        <Text style={[styles.cardHeader, { color: theme.muted }]}>
          TESTING NOTE
        </Text>

        <Text
          style={[
            styles.cardDesc,
            { color: theme.muted, marginBottom: 0 },
          ]}
        >
          While testing in Expo Go, keep the app open and in the foreground.
          This version checks the time in JavaScript, so it is not yet a
          background-reliable alarm. We will solve the native alarm and
          background part when you move to an APK build.
        </Text>
      </View>
    </ScrollView>
  </KeyboardAvoidingView>
);

  const renderSettingsTab = () => (
    <ScrollView
      style={styles.tabScroll}
      contentContainerStyle={styles.tabContent}
      keyboardShouldPersistTaps="handled">
      <View style={[styles.card, themedCard(theme)]}>
        <Text style={[styles.cardHeader, { color: theme.muted }]}>THEME</Text>
        <Text style={[styles.cardDesc, { color: theme.muted }]}>
          Choose the look that fits you. Colors, roundness, and optional
          wallpaper settings live together near the top of this file.
        </Text>
        <View style={styles.themeGrid}>
          {Object.entries(THEMES).map(([key, itemTheme]) => {
            const selected = key === themeKey;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.themeChoice,
                  {
                    backgroundColor: itemTheme.bg,
                    borderColor: selected ? theme.accent : 'transparent',
                    borderRadius: itemTheme.radius,
                  },
                ]}
                onPress={() => {
                  setThemeKey(key);
                  saveSettings({ themeKey: key });
                }}
                accessibilityRole="button"
                accessibilityLabel={`${itemTheme.label} theme`}
                accessibilityState={{ selected }}>
                <View
                  style={[
                    styles.themeSwatch,
                    {
                      backgroundColor: itemTheme.accent,
                      borderRadius: itemTheme.radius,
                    },
                  ]}
                />
                <Text
                  style={{
                    color: itemTheme.text,
                    fontWeight: '900',
                    fontSize: 12,
                  }}>
                  {itemTheme.label}
                </Text>
                {selected && (
                  <Text
                    style={{
                      color: itemTheme.accent,
                      fontSize: 10,
                      fontWeight: '900',
                      marginTop: 4,
                    }}>
                    ACTIVE
                  </Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, themedCard(theme)]}>
        <Text style={[styles.cardHeader, { color: theme.muted }]}>
          ALARM SOUND
        </Text>
        <Text style={[styles.cardDesc, { color: theme.muted }]}>
          Tap a tone to select it and hear a 3-second preview. Chimes is the
          default.
        </Text>
        <View style={styles.soundGrid}>
          {Object.entries(SOUND_PROFILES).map(([key, profile]) => {
            const selected = key === soundProfile;
            return (
              <TouchableOpacity
                key={key}
                style={[
                  styles.soundChoice,
                  {
                    backgroundColor: selected ? theme.accent : theme.surfaceAlt,
                    borderColor: selected ? theme.accent : theme.border,
                    borderRadius: theme.radius,
                  },
                ]}
                onPress={() => {
                  setSoundProfile(key);
                  saveSettings({ soundProfile: key });
                  previewAudio(key);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${profile.name} alarm sound. Tap to select and preview.`}
                accessibilityState={{ selected }}>
                <Feather
                  name="volume-2"
                  size={18}
                  color={selected ? theme.accentText : theme.muted}
                />
                <Text
                  style={{
                    color: selected ? theme.accentText : theme.text,
                    fontWeight: '800',
                    fontSize: 12,
                    marginTop: 8,
                    textAlign: 'center',
                  }}>
                  {profile.name}
                </Text>
                <Text
                  style={{
                    color: selected ? theme.accentText : theme.muted,
                    fontWeight: '800',
                    fontSize: 9,
                    marginTop: 5,
                    letterSpacing: 0.7,
                  }}>
                  {key === DEFAULT_SOUND ? 'DEFAULT' : 'PREVIEW'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <View style={[styles.card, themedCard(theme)]}>
        <Text style={[styles.cardHeader, { color: theme.muted }]}>SNOOZE</Text>
        <View style={[styles.row, { marginBottom: 18 }]}>
          <View style={styles.flex}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>
              Snooze length
            </Text>
            <Text style={[styles.rowDesc, { color: theme.muted }]}>
              Choose 1–15 minutes.
            </Text>
          </View>
          <View
            style={[
              styles.stepper,
              {
                backgroundColor: theme.surfaceAlt,
                borderColor: theme.border,
                borderRadius: theme.largeRadius,
              },
            ]}>
            <TouchableOpacity
              style={styles.stepButton}
              onPress={() => {
                const next = Math.max(1, snoozeDuration - 1);
                setSnoozeDuration(next);
                saveSettings({ snoozeDuration: next });
              }}
              accessibilityRole="button"
              accessibilityLabel="Decrease snooze length">
              <Text
                style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>
                −
              </Text>
            </TouchableOpacity>
            <Text
              style={{
                color: theme.text,
                fontSize: 14,
                fontWeight: '800',
                minWidth: 52,
                textAlign: 'center',
              }}>
              {snoozeDuration} min
            </Text>
            <TouchableOpacity
              style={styles.stepButton}
              onPress={() => {
                const next = Math.min(15, snoozeDuration + 1);
                setSnoozeDuration(next);
                saveSettings({ snoozeDuration: next });
              }}
              accessibilityRole="button"
              accessibilityLabel="Increase snooze length">
              <Text
                style={{ color: theme.text, fontSize: 22, fontWeight: '800' }}>
                +
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.flex}>
            <Text style={[styles.rowLabel, { color: theme.text }]}>
              Cruelty mode
            </Text>
            <Text style={[styles.rowDesc, { color: theme.muted }]}>
              Each successful snooze is half as long as the last.
            </Text>
          </View>
          <Switch
            value={crueltyMode}
            onValueChange={(value) => {
              setCrueltyMode(value);
              saveSettings({ crueltyMode: value });
            }}
            trackColor={{ false: theme.border, true: theme.accent }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Cruelty mode"
          />
        </View>
      </View>
    </ScrollView>
  );

  const renderScannerModal = () => (
    <Modal
      visible={isScannerOpen}
      animationType="fade"
      transparent={false}
      onRequestClose={() => setIsScannerOpen(false)}>
      <View style={styles.scannerModal}>
        <CameraView
          style={StyleSheet.absoluteFillObject}
          onBarcodeScanned={handleScan}
        />
        <View pointerEvents="none" style={styles.scannerScrim} />
        <View pointerEvents="none" style={styles.viewfinder}>
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </View>
        <Text style={styles.scanText}>
          {scannerPurpose === 'setup'
            ? 'Scan the item you want to use as your wake target.'
            : 'Scan your wake item to disarm.'}
        </Text>
        <TouchableOpacity
          style={styles.scannerClose}
          onPress={() => setIsScannerOpen(false)}
          accessibilityRole="button"
          accessibilityLabel="Close scanner">
          <Feather name="x" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>
    </Modal>
  );

  if (isRinging || isSnoozed) {
    const backgroundColor = isSnoozed ? theme.snoozeBg : theme.ringBg;

    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor }]}>
        <StatusBar barStyle="light-content" backgroundColor={backgroundColor} />
        <View
  style={[
    styles.ringingContainer,
    isSnoozed && styles.snoozingContainer,
  ]}
>
          <Text style={styles.ringingHeadline}>
            {isSnoozed ? 'SNOOZING' : 'WAKE UP'}
          </Text>
          <Text style={styles.ringingClock}>
  {isSnoozed
    ? `${snoozeDuration} min`
    : formatNowForDisplay(now)}
</Text>
{isSnoozed && (
  <Text style={styles.snoozeMessage}>
    Your alarm will ring again soon.
  </Text>
)}

          {!isSnoozed && !showKeypad && (
            <>
              <TouchableOpacity
                style={styles.disarmButton}
                onPress={() => openScanner('disarm')}
                accessibilityRole="button"
                accessibilityLabel="Scan wake item to disarm">
                <Feather name="camera" size={24} color="#4A0E14" />
                <Text style={styles.disarmButtonText}>
                  Scan Wake Item to Disarm
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.snoozeToggle}
                onPress={() => setShowKeypad(true)}
                accessibilityRole="button"
                accessibilityLabel="Enter snooze code">
                <Text style={styles.snoozeToggleText}>
                  Enter code to snooze instead
                </Text>
              </TouchableOpacity>
            </>
          )}

          {!isSnoozed && showKeypad && (
            <View style={styles.keypadPanel}>
              <Text
                style={styles.pinDots}
                accessibilityLabel={`${enteredPin.length} of 10 code digits entered`}>
                {enteredPin.padEnd(10, '•').split('').join(' ')}
              </Text>
              <View style={styles.keypadGrid}>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((number) => (
                  <TouchableOpacity
                    key={number}
                    style={styles.keyButton}
                    onPress={() =>
                      setEnteredPin((old) =>
                        old.length < 10 ? `${old}${number}` : old
                      )
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Digit ${number}`}>
                    <Text style={styles.keyText}>{number}</Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={styles.keyButtonWide}
                  onPress={() => setEnteredPin('')}
                  accessibilityRole="button"
                  accessibilityLabel="Clear snooze code">
                  <Text style={styles.keyTextSmall}>CLEAR</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.keyButton}
                  onPress={() =>
                    setEnteredPin((old) => (old.length < 10 ? `${old}0` : old))
                  }
                  accessibilityRole="button"
                  accessibilityLabel="Digit 0">
                  <Text style={styles.keyText}>0</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.keyButtonWide, { backgroundColor: '#FFFFFF' }]}
                  onPress={submitPin}
                  accessibilityRole="button"
                  accessibilityLabel="Submit snooze code">
                  <Text style={[styles.keyTextSmall, { color: '#4A0E14' }]}>
                    CONFIRM
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={styles.scanInsteadButton}
                onPress={() => setShowKeypad(false)}
                accessibilityRole="button"
                accessibilityLabel="Scan wake item instead">
                <Text style={styles.snoozeToggleText}>
                  Scan wake item instead
                </Text>
              </TouchableOpacity>
              {crueltyMode && (
                <Text style={styles.crueltyNote}>
                  Cruelty mode is active: the next snooze will be shorter.
                </Text>
              )}
            </View>
          )}

        </View>
        {renderScannerModal()}
      </SafeAreaView>
    );
  }

  return (
  <ImageBackground
    source={isArmed ? undefined : theme.wallpaper}
    style={[
      styles.safeArea,
      { backgroundColor: isArmed ? theme.armedBg : theme.bg },
    ]}
    resizeMode="cover"
    imageStyle={styles.wallpaperImage}
  >
      <StatusBar
        barStyle="light-content"
        backgroundColor={isArmed ? theme.armedBg : theme.bg}
      />

      <View style={styles.topbar}>
        <View
  style={[
    styles.brandLockup,
    {
      backgroundColor: isArmed
        ? 'rgba(245, 181, 76, 0.12)'
        : theme.surface,
      borderColor: isArmed ? '#F5B54C' : theme.border,
    },
  ]}
>
  <View
    style={[
      styles.brandMark,
      {
        backgroundColor: isArmed ? '#F5B54C' : theme.accent,
      },
    ]}
  >
    <Feather
      name="sunrise"
      size={18}
      color={isArmed ? '#2A1B12' : theme.accentText}
    />
  </View>

  <View style={styles.brandTextWrap}>
    <Text
      style={[
        styles.brand,
        { color: isArmed ? '#F5B54C' : theme.text },
      ]}
    >
      WAKE / UP
    </Text>

    <Text
      style={[
        styles.brandTagline,
        { color: isArmed ? '#F5B54C' : theme.muted },
      ]}
    >
      ONE ALARM · ONE MISSION
    </Text>
  </View>
</View>
        <View
          style={[
            styles.statusPill,
            {
              backgroundColor: isArmed ? 'transparent' : theme.surface,
              borderColor: isArmed ? '#F5B54C' : theme.border,
            },
          ]}>
          <View
            style={[
              styles.statusIcon,
              { backgroundColor: isArmed ? '#F5B54C' : theme.accent },
            ]}>
            <Feather
              name={isArmed ? 'shield' : 'moon'}
              size={13}
              color={isArmed ? '#2A1B12' : theme.accentText}
            />
          </View>
          <Text
            style={[
              styles.statusState,
              { color: isArmed ? '#F5B54C' : theme.text },
            ]}>
            {isArmed ? 'Armed' : 'Standby'}
          </Text>
        </View>
      </View>

      <View style={styles.views}>
        {activeTab === 'alarm' && renderAlarmTab()}
        {activeTab === 'setup' && !isArmed && renderSetupTab()}
        {activeTab === 'settings' && !isArmed && renderSettingsTab()}

        {isArmed && activeTab !== 'alarm' && (
          <View style={styles.lockedPanel}>
            <Feather name="lock" size={34} color="#7A7A88" />
            <Text style={styles.lockedText}>
              Setup and Settings are locked while the alarm is armed.
            </Text>
            <TouchableOpacity
              style={[
                styles.secondaryAction,
                {
                  backgroundColor: theme.surface,
                  borderColor: theme.border,
                  borderRadius: theme.largeRadius,
                },
              ]}
              onPress={() => setActiveTab('alarm')}>
              <Text style={[styles.secondaryActionText, { color: theme.text }]}>
                Back to alarm
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {!isArmed && (
        <View
          style={[
            styles.navbar,
            { backgroundColor: theme.surface, borderTopColor: theme.border },
          ]}>
          {[
            { key: 'alarm', label: 'Alarm', icon: 'clock' },
            { key: 'setup', label: 'Setup', icon: 'target' },
            { key: 'settings', label: 'Settings', icon: 'settings' },
          ].map((item) => {
            const selected = activeTab === item.key;
            return (
              <TouchableOpacity
                key={item.key}
                style={styles.navButton}
                onPress={() => setActiveTab(item.key)}
                accessibilityRole="button"
                accessibilityLabel={`${item.label} tab`}
                accessibilityState={{ selected }}>
                <Feather
                  name={item.icon}
                  size={21}
                  color={selected ? theme.accent : theme.muted}
                />
                <Text
                  style={{
                    color: selected ? theme.accent : theme.muted,
                    fontSize: 10.5,
                    fontWeight: '800',
                    marginTop: 4,
                  }}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

          {renderScannerModal()}
  </ImageBackground>
);
}

function themedCard(theme) {
  return {
    backgroundColor: theme.surface,
    borderColor: theme.border,
    borderRadius: theme.radius,
    shadowColor: theme.key === 'minimal' ? '#000000' : theme.accent,
  };
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  flex: { flex: 1 },
  views: { flex: 1 },

  topbar: {
  minHeight: Platform.OS === 'android' ? 96 : 84,
  paddingHorizontal: 20,
  paddingTop:
    Platform.OS === 'android'
      ? (StatusBar.currentHeight ?? 0) + 12
      : 20,
  paddingBottom: 12,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'space-between',
},
  brandLockup: {
  minHeight: 52,
  flexDirection: 'row',
  alignItems: 'center',
  borderWidth: 1,
  borderRadius: 18,
  paddingHorizontal: 10,
  paddingVertical: 8,
  flexShrink: 1,
  marginRight: 10,
},

brandMark: {
  width: 32,
  height: 32,
  borderRadius: 11,
  alignItems: 'center',
  justifyContent: 'center',
  marginRight: 8,
},

brandTextWrap: {
  flexShrink: 1,
},

brand: {
  fontSize: 16,
  fontWeight: '900',
  letterSpacing: 0.7,
  lineHeight: 19,
  fontFamily: Platform.OS === 'android' ? 'sans-serif-condensed' : undefined,
  includeFontPadding: false,
},

brandTagline: {
  fontSize: 8.5,
  fontWeight: '800',
  letterSpacing: 0.85,
  lineHeight: 11,
  marginTop: 2,
  opacity: 0.76,
  includeFontPadding: false,
},
  statusPill: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 22,
    height: 22,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  statusState: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.1,
    lineHeight: 16,
    fontFamily: Platform.OS === 'android' ? 'sans-serif-medium' : undefined,
    includeFontPadding: false,
  },

  tabScroll: { flex: 1, paddingHorizontal: 22 },
  tabContent: { paddingTop: 10, paddingBottom: 24 },

  missionLabel: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
    marginTop: 10,
  },
  clockWrap: { alignItems: 'center', marginVertical: 34 },
  clockTime: {
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: -1,
    fontVariant: ['tabular-nums'],
  },
  clockSub: {
    fontSize: 13,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },

  primaryAction: {
    minHeight: 60,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },

  card: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeader: {
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
    marginBottom: 10,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardDesc: { fontSize: 12.5, lineHeight: 18, marginBottom: 14 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  rowLabel: { fontSize: 14, fontWeight: '800' },
  rowDesc: { fontSize: 12, lineHeight: 17, marginTop: 3 },

  timeButton: {
    minHeight: 76,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    gap: 14,
  },
  timeButtonTextWrap: { flex: 1 },
  timeButtonValue: {
    fontSize: 28,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  timeButtonHint: { fontSize: 12, fontWeight: '600', marginTop: 2 },
  nativePickerWrap: {
    borderWidth: 1,
    marginTop: 10,
    padding: 8,
    alignItems: 'center',
  },
  doneTimeButton: {
    minWidth: 110,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    marginBottom: 4,
  },
  doneTimeText: { fontSize: 12, fontWeight: '900', letterSpacing: 1 },

  repeatLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 16,
    marginBottom: 10,
  },
  dayRow: { flexDirection: 'row', gap: 5 },
  dayChip: {
    flex: 1,
    minHeight: 44,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },

  secondaryAction: {
    minHeight: 44,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionText: { fontSize: 13, fontWeight: '800' },
  pinInput: {
    minHeight: 52,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
  },

  themeGrid: { flexDirection: 'row', gap: 9 },
  themeChoice: {
    flex: 1,
    minHeight: 112,
    borderWidth: 2,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  themeSwatch: { width: 30, height: 30, marginBottom: 8 },

  soundGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  soundChoice: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 104,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },

  stepper: {
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  stepButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  navbar: {
    minHeight: 76,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingTop: 8,
    paddingBottom: 12,
  },
  navButton: {
    flex: 1,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },

  lockedPanel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  lockedText: {
    color: '#A1A1AA',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
  },

  ringingContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 22,
    paddingTop: 48,
  },
  snoozingContainer: {
  justifyContent: 'center',
  paddingTop: 0,
},
  ringingHeadline: {
    color: '#FFE7E4',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2,
  },
  ringingClock: {
    color: '#FFFFFF',
    fontSize: 56,
    fontWeight: '800',
    marginTop: 10,
    fontVariant: ['tabular-nums'],
  },
  disarmButton: {
    width: '100%',
    minHeight: 68,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    marginTop: 32,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  disarmButtonText: { color: '#4A0E14', fontSize: 16, fontWeight: '900' },
  snoozeToggle: {
    width: '100%',
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    marginTop: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  snoozeToggleText: { color: '#FFE9E6', fontSize: 13.5, fontWeight: '800' },

  keypadPanel: { width: '100%', alignItems: 'center', marginTop: 20 },
  pinDots: {
    color: '#FFFFFF',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 5,
    marginBottom: 22,
  },
  keypadGrid: {
    width: Math.min(width - 44, 320),
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
  },
  keyButton: {
    width: 90,
    height: 60,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyButtonWide: {
    width: 140,
    height: 60,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyText: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  keyTextSmall: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  scanInsteadButton: {
    minHeight: 44,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crueltyNote: {
    color: '#FFD0C9',
    fontSize: 11.5,
    fontWeight: '700',
    marginTop: 12,
    textAlign: 'center',
  },
  snoozeMessage: {
  color: 'rgba(255,255,255,0.76)',
  fontSize: 15,
  fontWeight: '700',
  textAlign: 'center',
  marginTop: 4,
},
  scannerModal: { flex: 1, backgroundColor: '#000000' },
  scannerScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.44)',
  },
  viewfinder: {
    position: 'absolute',
    top: '34%',
    left: '50%',
    width: 250,
    height: 150,
    transform: [{ translateX: -125 }],
  },
  corner: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderColor: '#7AF5D9',
    borderWidth: 3,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 8,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 8,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    borderBottomRightRadius: 8,
  },
  scanText: {
    position: 'absolute',
    top: '64%',
    left: 24,
    right: 24,
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 20,
  },
  scannerClose: {
    position: 'absolute',
    top: 52,
    right: 20,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelPinButton: {
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  cancelPinText: {
    fontSize: 13,
    fontWeight: '800',
  },
  wallpaperImage: {
  opacity: 0.55,
},
});