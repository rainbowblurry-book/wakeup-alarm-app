const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'App.js');
let source = fs.readFileSync(appPath, 'utf8');

const oldBadge = `          <View
            style={[
              styles.statusIcon,
              { backgroundColor: isArmed ? '#F5B54C' : theme.accent },
            ]}>
            <Feather
              name={isArmed ? 'shield' : 'moon'}
              size={12}
              color={isArmed ? '#2A1B12' : theme.accentText}
            />
          </View>
          <View style={styles.statusTextWrap}>
            <Text
              style={[
                styles.statusKicker,
                { color: isArmed ? '#F5B54C' : theme.muted },
              ]}>
              ALARM
            </Text>
            <Text
              style={[
                styles.statusState,
                { color: isArmed ? '#F5B54C' : theme.text },
              ]}>
              {isArmed ? 'ARMED' : 'STANDBY'}
            </Text>
          </View>`;

const newBadge = `          <View
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
          </Text>`;

const oldStyles = `  statusPill: {
    minHeight: 48,
    minWidth: 92,
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIcon: {
    width: 26,
    height: 26,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  statusTextWrap: {
    flexShrink: 1,
  },
  statusKicker: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.8,
    lineHeight: 10,
    includeFontPadding: false,
  },
  statusState: {
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.6,
    lineHeight: 13,
    includeFontPadding: false,
  },`;

const newStyles = `  statusPill: {
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
  },`;

if (!source.includes(oldBadge) || !source.includes(oldStyles)) {
  throw new Error('App.js does not match the expected two-line badge. No changes were made.');
}

source = source.replace(oldBadge, newBadge).replace(oldStyles, newStyles);
fs.writeFileSync(appPath, source);
console.log('Compact standby badge applied to App.js.');
