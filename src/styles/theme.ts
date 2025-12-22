import { StyleSheet } from 'react-native';

// Color palette
export const colors = {
  background: '#0f0f1a',
  surface: '#1a1a2e',
  surfaceDark: '#16213e',
  surfaceLight: '#24314e',
  border: '#16213e',
  borderLight: '#22314f',
  borderSubtle: 'rgba(232,232,232,0.08)',
  borderSubtle2: 'rgba(232,232,232,0.06)',
  
  text: '#e8e8e8',
  textMuted: '#a0a0a0',
  textDim: '#666',
  textSearch: '#8b93a7',
  
  accent: '#e94560',
  accentLight: 'rgba(233, 69, 96, 0.25)',
  accentLighter: 'rgba(233, 69, 96, 0.2)',
  accentSubtle: 'rgba(233, 69, 96, 0.15)',

  warningOrange: '#f97316',
  warningYellow: '#eab308',
  
  success: '#22c55e',
  info: '#60a5fa',
  dark: '#0b1020',
  
  overlayDark: 'rgba(0,0,0,0.65)',
  overlayLight: 'rgba(0,0,0,0.25)',
  overlayHeavy: 'rgba(0,0,0,0.6)',
  overlayFull: 'rgba(0,0,0,0.95)',
};

// Common spacing values
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 14,
  xl: 16,
  xxl: 20,
  xxxl: 24,
};

// Common border radii
export const radii = {
  sm: 8,
  md: 10,
  lg: 12,
  xl: 14,
  xxl: 16,
  pill: 999,
};

// Typography
export const typography = {
  small: 11,
  body: 12,
  regular: 13,
  medium: 14,
  large: 16,
  xlarge: 18,
  xxlarge: 20,
  xxxlarge: 22,
  huge: 36,
};

export const styles = StyleSheet.create({
  // Layout
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl },
  row: { flexDirection: 'row' },
  
  // Header
  header: { padding: spacing.md, backgroundColor: colors.surface, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerTitle: { flex: 1, color: colors.text, fontSize: typography.xlarge, fontWeight: '700', letterSpacing: 0.2, marginLeft: spacing.md },
  headerButtons: { flexDirection: 'row', gap: spacing.sm },
  headerBtn: { backgroundColor: colors.surfaceDark, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radii.sm },
  headerBtnText: { color: colors.text, fontSize: typography.regular, fontWeight: '600' },
  
  // Drawer
  drawerHeader: { padding: spacing.xxl, borderBottomWidth: 1, borderBottomColor: colors.surfaceDark },
  drawerTitle: { color: colors.text, fontSize: spacing.xxl, fontWeight: '800' },
  drawerItem: { marginHorizontal: spacing.sm, marginVertical: spacing.xs, borderRadius: radii.sm },
  drawerItemLabel: { color: colors.text, fontSize: typography.large, fontWeight: '600' },
  
  // Processing
  processingBar: { paddingVertical: spacing.sm, backgroundColor: colors.accentSubtle },
  processingText: { textAlign: 'center', color: colors.accent, fontWeight: '600' },
  
  // UI Busy Modal
  uiBusyOverlay: { flex: 1, backgroundColor: colors.overlayDark, alignItems: 'center', justifyContent: 'center', padding: spacing.xxxl },
  uiBusyCard: { width: '100%', maxWidth: 320, backgroundColor: colors.surface, borderRadius: radii.xxl, paddingVertical: 18, paddingHorizontal: spacing.xl, alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: colors.surfaceDark },
  uiBusyText: { color: colors.text, fontSize: typography.medium, fontWeight: '700' },
  
  // Controls
  controls: { padding: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceLight, borderRadius: radii.xl, paddingHorizontal: spacing.md, paddingVertical: 10, borderWidth: 1, borderColor: colors.borderSubtle },
  searchIcon: { marginRight: spacing.sm, color: colors.textSearch, fontSize: typography.large },
  searchInput: { flex: 1, color: colors.text, fontSize: typography.large, fontWeight: '600' },
  searchClearBtn: { marginLeft: spacing.sm, width: 28, height: 28, borderRadius: radii.xl, backgroundColor: 'rgba(22,33,62,0.9)', alignItems: 'center', justifyContent: 'center' },
  searchClearText: { color: colors.text, fontSize: typography.xxlarge, fontWeight: '800', marginTop: -1 },
  search: { backgroundColor: colors.surfaceDark, borderRadius: radii.md, padding: spacing.md, color: colors.text },
  
  // Dropdown
  dropdownRow: { flexDirection: 'row', gap: 10 },
  dropdown: { flex: 1, backgroundColor: colors.surfaceDark, borderRadius: radii.lg, paddingVertical: 10, paddingHorizontal: spacing.md, gap: spacing.xs },
  dropdownLabel: { color: colors.textMuted, fontSize: typography.small, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  dropdownValue: { color: colors.text, fontSize: typography.medium, fontWeight: '700' },
  dropdownOverlay: { flex: 1, backgroundColor: colors.overlayLight },
  dropdownMenu: {
    position: 'absolute',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderLight,
    overflow: 'hidden',
  },
  dropdownOption: { paddingVertical: spacing.md, paddingHorizontal: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle2 },
  dropdownOptionText: { color: colors.text, fontWeight: '800' },
  
  // Tabs
  tabRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  tabPill: { flexDirection: 'row', backgroundColor: colors.surfaceDark, borderRadius: radii.pill, padding: spacing.xs, borderWidth: 1, borderColor: colors.borderLight },
  tabBtn: { paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, borderRadius: radii.pill },
  tabBtnActive: { backgroundColor: colors.surfaceLight },
  tabText: { color: colors.textMuted, fontSize: typography.regular, fontWeight: '800' },
  tabTextActive: { color: colors.text },
  sortBox: { width: 150 },
  
  // List items
  listRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: spacing.md, marginVertical: 5, padding: spacing.lg, borderRadius: radii.xl },
  rowWarn: { borderLeftWidth: 4, borderLeftColor: colors.accent },
  rank: { width: 28, textAlign: 'center', color: colors.textDim, fontWeight: '600' },
  itemText: { flex: 1, color: colors.text, fontSize: typography.xxlarge, fontWeight: '600' },
  itemGloss: { color: colors.textMuted, fontSize: typography.medium, fontWeight: '600' },
  counts: { width: 76, alignItems: 'center' },
  countLabel: { color: colors.textDim, fontSize: typography.small, textTransform: 'uppercase' },
  countVal: { color: colors.text, fontSize: typography.large, fontWeight: '700' },
  warnText: { color: colors.accent },
  
  // Bottom bar
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, padding: spacing.md, flexDirection: 'row', gap: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  bottomBtn: { flex: 1, paddingVertical: spacing.lg, borderRadius: radii.lg, alignItems: 'center' },
  encBtn: { backgroundColor: colors.success },
  pracBtn: { backgroundColor: colors.info },
  bottomBtnText: { color: colors.dark, fontWeight: '800' },
  
  // Text helpers
  muted: { color: colors.textDim, textAlign: 'center' },
  mutedSmall: { color: colors.textDim, fontSize: typography.body },
  mutedSmallCenter: { color: colors.textDim, fontSize: typography.body, textAlign: 'center', paddingBottom: 10 },
  
  // Settings
  settingsTitle: { color: colors.text, fontSize: typography.xxxlarge, fontWeight: '900', marginBottom: spacing.md },
  settingsSection: { backgroundColor: colors.surface, borderRadius: radii.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  settingsSectionTitle: { color: colors.text, fontSize: typography.medium, fontWeight: '900', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.6 },
  settingsSubTitle: { color: colors.textMuted, fontSize: typography.body, fontWeight: '900', marginBottom: spacing.sm, textTransform: 'uppercase', letterSpacing: 0.6 },
  hiddenRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surfaceDark, borderRadius: radii.lg, paddingVertical: 10, paddingHorizontal: spacing.md, marginBottom: spacing.sm },
  hiddenMain: { flex: 1, color: colors.text, fontSize: typography.xlarge, fontWeight: '800' },
  hiddenX: { marginLeft: 10, width: 28, height: 28, borderRadius: radii.xl, backgroundColor: colors.accentLight, alignItems: 'center', justifyContent: 'center' },
  hiddenXText: { color: colors.text, fontSize: typography.xxlarge, fontWeight: '900', marginTop: -1 },
  
  // Detail screen
  detailHeader: { padding: spacing.lg, borderBottomWidth: 1, borderBottomColor: colors.border },
  detailTitle: { color: colors.text, fontSize: typography.huge, fontWeight: '800' },
  detailSubtitle: { color: colors.textMuted, fontSize: typography.medium, fontWeight: '700', marginTop: 2 },
  detailInfoCard: { marginTop: spacing.md, backgroundColor: colors.surfaceDark, borderRadius: radii.xl, padding: spacing.md, gap: 10 },
  detailInfoRow: { gap: spacing.xs },
  detailInfoLabel: { color: colors.textMuted, fontSize: typography.body, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  detailInfoValue: { color: colors.text, fontSize: typography.large, fontWeight: '600', lineHeight: 22 },
  readingsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  readingPill: { alignSelf: 'flex-start', backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderWidth: 1, borderColor: colors.borderLight },
  readingPillText: { color: colors.text, fontSize: typography.large, fontWeight: '800' },
  detailStatsRow: { flexDirection: 'row', gap: 10, marginTop: spacing.md },
  detailStatPill: { flex: 1, backgroundColor: colors.surfaceDark, borderRadius: radii.xl, paddingVertical: 10, paddingHorizontal: spacing.md },
  detailStatNum: { color: colors.text, fontSize: typography.xxxlarge, fontWeight: '800' },
  detailStatLabel: { color: colors.textMuted, fontSize: typography.body, marginTop: 2, fontWeight: '600' },
  
  // Spotted items
  spottedRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: radii.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.md, marginBottom: spacing.sm, borderWidth: 1, borderColor: '#1e2b44' },
  spottedMain: { flex: 1, color: colors.text, fontSize: typography.xlarge, fontWeight: '700' },
  spottedGloss: { color: colors.textMuted, fontSize: typography.regular, fontWeight: '600' },
  spottedCounts: { width: 72, alignItems: 'center' },
  spottedCountLabel: { color: colors.textDim, fontSize: 10, textTransform: 'uppercase' },
  spottedCountVal: { color: colors.text, fontSize: typography.medium, fontWeight: '800' },
  kanjiListCard: { width: '100%', maxWidth: 420, backgroundColor: colors.surface, borderRadius: radii.xxl, padding: spacing.xl, gap: 10, borderWidth: 1, borderColor: colors.border },
  
  // Thumbnails
  thumbWrap: { width: '33.33%', padding: 6 },
  thumb: { width: '100%', aspectRatio: 1, borderRadius: radii.md, backgroundColor: colors.surfaceDark },
  
  // Full image viewer
  fullOverlay: { flex: 1, backgroundColor: colors.overlayFull },
  fullTapZone: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  fullImage: { width: '100%', height: '80%' },
  fullClose: { position: 'absolute', top: 56, right: spacing.xl, width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(22,33,62,0.9)', alignItems: 'center', justifyContent: 'center' },
  fullCloseText: { color: colors.text, fontSize: typography.xlarge, fontWeight: '800' },
  fullMenu: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, padding: spacing.xl, gap: 10, borderTopWidth: 1, borderTopColor: colors.border },
  fullMenuTitle: { color: colors.text, fontSize: typography.large, fontWeight: '800', textAlign: 'center' },
  
  // Modals
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: colors.overlayHeavy },
  modalCard: { backgroundColor: colors.surface, padding: spacing.xl, borderTopLeftRadius: radii.xxl, borderTopRightRadius: radii.xxl, gap: 10 },
  modalTitle: { color: colors.text, fontSize: typography.large, fontWeight: '700', textAlign: 'center', marginBottom: 6 },
  modalBtn: { backgroundColor: colors.surfaceDark, paddingVertical: spacing.lg, borderRadius: radii.lg, alignItems: 'center' },
  modalDanger: { backgroundColor: colors.accentLight },
  modalCancel: { backgroundColor: colors.accentLighter },
  modalBtnText: { color: colors.text, fontWeight: '700' },

  // Floating actions
  fabContainer: { position: 'absolute', right: spacing.xxxl, bottom: spacing.xxxl, alignItems: 'flex-end' },
  fab: { width: 64, height: 64, borderRadius: radii.lg, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
  fabIcon: { color: colors.dark, fontSize: typography.huge, fontWeight: '900', marginTop: -4 },
  fabMenu: { marginBottom: spacing.md, borderRadius: radii.xl, padding: spacing.sm, borderWidth: 1, gap: spacing.xs },
  fabMenuItem: { borderRadius: radii.lg, paddingVertical: spacing.md, paddingHorizontal: spacing.xl },
  fabMenuItemText: { fontWeight: '800', textAlign: 'center' },
});

