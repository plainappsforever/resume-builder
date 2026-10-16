// Month + year inputs for a stored date (`YYYY` or `YYYY-MM`, SPEC §5.2). Reports the text as typed; the screen decides
// when it is valid (engine/dates.ts), so an incomplete date is never saved half-way.
import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { t } from '@/i18n';

export type MonthYear = { month: string; year: string };

export function toMonthYear(stored: string | null): MonthYear {
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(stored ?? '');
  return m ? { year: m[1], month: m[2] ? String(Number(m[2])) : '' } : { year: '', month: '' };
}

/** Typed month + year → stored value; null = empty. `invalid` when the text cannot be a date (the screen shows the message). */
export function fromMonthYear({ month, year }: MonthYear): { value: string | null; invalid: boolean } {
  const y = year.trim();
  const m = month.trim();
  if (y === '' && m === '') return { value: null, invalid: false };
  if (!/^\d{4}$/.test(y) || (m !== '' && !/^\d{1,2}$/.test(m))) return { value: null, invalid: true };
  return { value: m === '' ? y : `${y}-${m.padStart(2, '0')}`, invalid: false };
}

export function MonthYearField({
  label,
  value,
  onChange,
  error,
  testID,
  disabled,
}: {
  label: string;
  value: MonthYear;
  onChange: (value: MonthYear) => void;
  error?: string | null;
  testID: string;
  disabled?: boolean;
}) {
  const theme = useTheme();
  const box = [styles.input, { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : 'transparent' }, disabled && { opacity: 0.4 }];
  return (
    <View style={styles.wrap}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <View style={styles.row}>
        <TextInput
          testID={`${testID}-month`}
          accessibilityLabel={`${label}: ${t('date.month')}`}
          placeholder={t('date.month')}
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          maxLength={2}
          editable={!disabled}
          value={value.month}
          onChangeText={(month) => onChange({ ...value, month })}
          style={[box, styles.month]}
        />
        <TextInput
          testID={`${testID}-year`}
          accessibilityLabel={`${label}: ${t('date.year')}`}
          placeholder={t('date.year')}
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          maxLength={4}
          editable={!disabled}
          value={value.year}
          onChangeText={(year) => onChange({ ...value, year })}
          style={[box, styles.year]}
        />
      </View>
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }} testID={`${testID}-error`}>
          {error}
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.two },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: Spacing.three, fontSize: 16, borderWidth: 1 },
  month: { width: 90 },
  year: { width: 120 },
});
