// Small shared building blocks of the editing screens (no business logic).
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BottomTabInset, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** `scrollKey`: whenever it changes the screen scrolls back to the top (the version screen passes its tab). */
export function Screen({ children, testID, scrollKey }: { children: ReactNode; testID: string; scrollKey?: string }) {
  const theme = useTheme();
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    ref.current?.scrollTo({ y: 0, animated: false });
  }, [scrollKey]);
  return (
    <ScrollView
      ref={ref}
      testID={testID}
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.screen}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return <View style={[styles.card, { backgroundColor: theme.backgroundElement }, style]}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <ThemedText type="smallBold" themeColor="textSecondary" style={styles.heading} accessibilityRole="header">
      {children}
    </ThemedText>
  );
}

export function Badge({ label, tone = 'info', testID }: { label: string; tone?: 'info' | 'new' | 'warn'; testID?: string }) {
  const theme = useTheme();
  const bg = tone === 'new' ? theme.tint : tone === 'warn' ? theme.danger : theme.backgroundSelected;
  const color = tone === 'info' ? theme.text : theme.onTint;
  return (
    <View testID={testID} style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color }]}>{label}</Text>
    </View>
  );
}

/** A small text button ("Up", "Delete", "Edit …"). */
export function LinkButton({
  label,
  onPress,
  testID,
  danger,
  disabled,
}: {
  label: string;
  onPress: () => void;
  testID?: string;
  danger?: boolean;
  disabled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.linkButton, (pressed || disabled) && { opacity: 0.5 }]}>
      <Text style={[styles.linkText, { color: danger ? theme.danger : theme.tint }]}>{label}</Text>
    </Pressable>
  );
}

/** Up/down arrows with spoken labels. */
export function MoveButtons({
  onUp,
  onDown,
  canUp,
  canDown,
  upLabel,
  downLabel,
  testID,
}: {
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
  upLabel: string;
  downLabel: string;
  testID: string;
}) {
  const theme = useTheme();
  const button = (label: string, glyph: string, id: string, enabled: boolean, onPress: () => void) => (
    <Pressable
      testID={`${testID}-${id}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !enabled }}
      disabled={!enabled}
      onPress={onPress}
      hitSlop={4}
      style={[styles.moveButton, { backgroundColor: theme.backgroundSelected }, !enabled && { opacity: 0.3 }]}>
      <Text style={[styles.moveGlyph, { color: theme.text }]}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={styles.moveRow}>
      {button(upLabel, '↑', 'up', canUp, onUp)}
      {button(downLabel, '↓', 'down', canDown, onDown)}
    </View>
  );
}

export function IncludeSwitch({ value, onChange, label, testID }: { value: boolean; onChange: (v: boolean) => void; label: string; testID: string }) {
  return <Switch testID={testID} accessibilityLabel={label} value={value} onValueChange={onChange} />;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View testID={testID} style={[styles.segmented, { backgroundColor: theme.backgroundElement }]}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testID}-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, selected && { backgroundColor: theme.backgroundSelected }]}>
            <ThemedText type={selected ? 'smallBold' : 'small'} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              {o.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Choices that wrap onto several lines (large text sizes never cut a label off, unlike Segmented's one row). */
export function Chips<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testID: string;
}) {
  const theme = useTheme();
  return (
    <View testID={testID} style={styles.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            testID={`${testID}-${o.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, { backgroundColor: selected ? theme.tint : theme.backgroundElement }]}>
            <Text style={{ color: selected ? theme.onTint : theme.text, fontSize: 14, fontWeight: selected ? '700' : '500' }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type FieldProps = Omit<TextInputProps, 'value' | 'onChangeText' | 'onBlur'> & {
  label: string;
  value: string;
  /** Called (debounced, and on blur / leaving the screen) with the new text: autosave. */
  onSave: (text: string) => void | Promise<unknown>;
  /** Called at once on every change (local screen state that is read when a button is tapped). */
  onDraft?: (text: string) => void;
  error?: string | null;
  hint?: string;
  testID: string;
};

/**
 * A text field that saves while typing (150 ms after the last key), on blur and when the screen is left, so an edit
 * survives the app being killed right after it (A12). Outside changes show up while the field is not being edited.
 */
export function AutoTextField({ label, value, onSave, onDraft, error, hint, testID, multiline, ...rest }: FieldProps) {
  const theme = useTheme();
  const [draft, setDraft] = useState(value);
  const dirty = useRef(false);
  const latest = useRef({ draft: value, onSave });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    latest.current.onSave = onSave;
  });
  useEffect(() => {
    if (!dirty.current) {
      setDraft(value);
      latest.current.draft = value;
    }
  }, [value]);

  function flush() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!dirty.current) return;
    dirty.current = false;
    void latest.current.onSave(latest.current.draft);
  }
  useEffect(() => flush, []);

  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        testID={testID}
        accessibilityLabel={label}
        value={draft}
        multiline={multiline}
        // A long text grows the field instead of scrolling inside it: a swipe over it must scroll the screen.
        scrollEnabled={multiline ? false : undefined}
        onChangeText={(text) => {
          dirty.current = true;
          latest.current.draft = text;
          setDraft(text);
          onDraft?.(text);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(flush, 150);
        }}
        onBlur={flush}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: error ? theme.danger : theme.backgroundSelected },
          multiline && styles.multiline,
        ]}
        {...rest}
      />
      {error ? (
        <ThemedText type="small" style={{ color: theme.danger }} testID={`${testID}-error`}>
          {error}
        </ThemedText>
      ) : hint ? (
        <ThemedText type="small" themeColor="textSecondary">
          {hint}
        </ThemedText>
      ) : null}
    </View>
  );
}

/** Bottom bar with a message and one action, for 5 seconds (undo after a delete, SPEC §10). */
export function UndoBar({ message, actionLabel, onAction, onExpire }: { message: string; actionLabel: string; onAction: () => void; onExpire: () => void }) {
  const theme = useTheme();
  useEffect(() => {
    const id = setTimeout(onExpire, 5000);
    return () => clearTimeout(id);
  }, [message, onExpire]);
  return (
    <View testID="undo-bar" style={[styles.undo, { backgroundColor: theme.text }]}>
      <Text style={{ color: theme.background, flex: 1, fontSize: 15 }}>{message}</Text>
      <Pressable testID="undo-action" accessibilityRole="button" onPress={onAction} hitSlop={8}>
        <Text style={{ color: theme.background, fontWeight: '700', fontSize: 15, textDecorationLine: 'underline' }}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // The bottom padding keeps the last control clear of the (translucent on iOS 26) tab bar.
  screen: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six + BottomTabInset + Spacing.three },
  card: { borderRadius: 14, padding: Spacing.three, gap: Spacing.two },
  heading: { marginTop: Spacing.two, textTransform: 'uppercase', letterSpacing: 0.4 },
  badge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  badgeText: { fontSize: 12, fontWeight: '700' },
  linkButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  linkText: { fontSize: 15, fontWeight: '600' },
  moveRow: { flexDirection: 'row', gap: Spacing.one },
  moveButton: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  moveGlyph: { fontSize: 18, fontWeight: '700' },
  segmented: { flexDirection: 'row', borderRadius: 12, padding: Spacing.one },
  segment: { flex: 1, minHeight: 40, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: Spacing.three, alignItems: 'center', justifyContent: 'center' },
  field: { gap: Spacing.one },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, fontSize: 16, borderWidth: 1 },
  multiline: { minHeight: 96, textAlignVertical: 'top' },
  undo: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    bottom: Spacing.four,
    borderRadius: 12,
    padding: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
