const fs = require('fs');
const path = require('path');

const appPath = path.join(__dirname, '..', 'App.js');
let source = fs.readFileSync(appPath, 'utf8');

const oldBadge = `          <View
            style={[
              styles.statusDot,
              { backgroundColor: isArmed ? '#F5B54C' : theme.accent },
            ]}
          />
          <Text
            style={{
              color: isArmed ? '#F5B54C' : theme.accent,
              fontSize: 11,
              fontWeight: '800',
              letterSpacing: 1,
            }}>
            {isArmed ? 'ARMED' : 'STANDBY'}
          </Text>`;

const newBadge = `          <View
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

const oldStyles = `  statusPill: {
    minHeight: 32,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: { width: 7, height: 7, borderRadius: 4 },`;

const newStyles = `  statusPill: {
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

if (!source.includes(oldBadge) || !source.includes(oldStyles)) {
  throw new Error('App.js does not match the expected header. No changes were made.');
}

source = source.replace(oldBadge, newBadge).replace(oldStyles, newStyles);
fs.writeFileSync(appPath, source);
console.log('Standby badge applied to App.js.');
