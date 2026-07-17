/* Theme Engine — defines preset palettes and applies safe, targeted CSS-variable
   based theming to a webpage. Runs inside the content-script context. */

const THEME_STYLE_ID = 'lcbc-theme-style';
const THEME_ATTR = 'data-lcbc-theme-active';

function buildTheme(base) {
  const t = { ...base };
  t.accent = t.accent || t.main || t.primary || '#8B5CF6';
  t.baseColor = t.baseColor || t.accent;
  t.strongAccent = t.strongAccent || t.accent;
  t.softAccent = t.softAccent || t.secondaryAccent || Utilities.lighten(t.accent, 0.45);
  t.secondaryAccent = t.secondaryAccent || t.softAccent;
  t.pageBackground = t.pageBackground || t.background || '#F8FAFC';
  t.secondaryBackground = t.secondaryBackground || t.secondaryBg || t.pageSecondaryBackground;
  t.primaryText = t.primaryText || t.text;
  t.secondaryText = t.secondaryText || t.secondaryLabel;
  t.mutedText = t.mutedText || t.secondaryText;
  if (t.isDark === undefined) {
    t.isDark = Utilities.relativeLuminance(t.pageBackground) < 0.4;
  }

  if (t.isDark) {
    t.veryDark = t.veryDark || t.pageBackground || Utilities.darken(t.accent, 0.9);
    t.dark = t.dark || Utilities.lighten(t.veryDark, 0.06);
    t.moderatelyDark = t.moderatelyDark || t.strongAccent || t.accent;
    t.midTone = t.midTone || t.accent;
    t.moderatelyLight = t.moderatelyLight || t.softAccent || Utilities.lighten(t.accent, 0.32);
    t.light = t.light || Utilities.lighten(t.dark, 0.24);
    t.veryLight = t.veryLight || '#F8FAFC';
  } else {
    t.veryLight = t.veryLight || t.surface || '#FFFFFF';
    t.light = t.light || t.pageBackground || Utilities.lighten(t.accent, 0.9);
    t.moderatelyLight = t.moderatelyLight || t.softAccent || Utilities.lighten(t.accent, 0.45);
    t.midTone = t.midTone || t.accent;
    t.moderatelyDark = t.moderatelyDark || t.strongAccent || Utilities.darken(t.accent, 0.15);
    t.dark = t.dark || Utilities.darken(t.accent, 0.55);
    t.veryDark = t.veryDark || Utilities.darken(t.accent, 0.78);
  }

  t.secondaryBackground = t.secondaryBackground || (t.isDark
    ? Utilities.lighten(t.pageBackground, 0.06)
    : Utilities.mixColors(t.pageBackground, t.accent, 0.05));
  t.surface = t.surface || (t.isDark ? Utilities.lighten(t.pageBackground, 0.09) : '#FFFFFF');
  t.elevatedSurface = t.elevatedSurface || (t.isDark ? Utilities.lighten(t.surface, 0.08) : '#FFFFFF');
  t.headerBackground = t.headerBackground || (t.isDark ? t.veryDark : t.veryLight);
  t.sidebarBackground = t.sidebarBackground || (t.isDark ? t.dark : t.secondaryBackground);
  t.cardBackground = t.cardBackground || t.surface;
  t.menuBackground = t.menuBackground || t.elevatedSurface;
  t.inputBackground = t.inputBackground || t.surface;
  t.primaryText = t.primaryText || (t.isDark ? '#F3F4F6' : '#172033');
  t.secondaryText = t.secondaryText || Utilities.mixColors(t.primaryText, t.pageBackground, t.isDark ? 0.28 : 0.32);
  t.mutedText = t.mutedText || Utilities.mixColors(t.primaryText, t.pageBackground, t.isDark ? 0.44 : 0.48);
  t.inverseText = t.inverseText || (t.isDark ? '#111827' : '#FFFFFF');
  t.inputText = t.inputText || t.primaryText;
  t.selectedBackground = t.selectedBackground || t.active || (t.isDark
    ? Utilities.mixColors(t.surface, t.accent, 0.28)
    : Utilities.mixColors(t.surface, t.accent, 0.16));
  t.hoverBackground = t.hoverBackground || t.hover || (t.isDark
    ? Utilities.lighten(t.surface, 0.08)
    : Utilities.mixColors(t.surface, t.accent, 0.08));
  t.border = t.border || Utilities.mixColors(t.pageBackground, t.primaryText, t.isDark ? 0.22 : 0.12);
  t.strongBorder = t.strongBorder || Utilities.mixColors(t.border, t.strongAccent, 0.45);
  t.subtleBorder = t.subtleBorder || Utilities.mixColors(t.pageBackground, t.primaryText, t.isDark ? 0.14 : 0.07);
  t.buttonBackground = t.buttonBackground || t.accent;
  t.buttonText = resolveReadableText(t.buttonBackground, t.buttonText);
  t.secondaryButtonBackground = t.secondaryButtonBackground || (t.isDark ? t.surface : t.veryLight);
  t.secondaryButtonText = resolveReadableText(t.secondaryButtonBackground, t.secondaryButtonText || t.primaryText);
  t.selectedText = resolveReadableText(t.selectedBackground, t.selectedText);
  t.link = t.link || t.accent;
  t.linkHover = t.linkHover || (t.isDark ? Utilities.lighten(t.link, 0.18) : Utilities.darken(t.link, 0.15));
  t.brightAccent = t.brightAccent || (t.isDark ? Utilities.lighten(t.accent, 0.18) : t.strongAccent);
  strengthenTextTone(t);
  t.blackBase = t.blackBase || (t.isDark ? '#050505' : t.veryDark);
  t.deepestBackground = t.deepestBackground || t.pageBackground;
  t.subtleAccentSurface = t.subtleAccentSurface || (t.isDark
    ? Utilities.mixColors(t.surface, t.accent, 0.16)
    : Utilities.mixColors(t.surface, t.accent, 0.08));
  t.success = t.success || '#16A34A';
  t.warning = t.warning || '#D97706';
  t.error = t.error || '#DC2626';
  t.selection = t.selection || Utilities.mixColors(t.accent, '#ffffff', 0.6);
  t.glow = t.glow || rgbaFromHex(t.accent, t.isDark ? 0.34 : 0.18);
  const lightGradients = t.isDark ? null : buildLightGradients(t);
  t.screenGradient = t.screenGradient || lightGradients?.screenGradient || 'none';
  t.headerGradient = t.headerGradient || lightGradients?.headerGradient || 'none';
  t.sidebarGradient = t.sidebarGradient || lightGradients?.sidebarGradient || 'none';
  t.surfaceGradient = t.surfaceGradient || lightGradients?.surfaceGradient || 'none';
  t.cardGradient = t.cardGradient || lightGradients?.cardGradient || 'none';
  t.menuGradient = t.menuGradient || lightGradients?.menuGradient || 'none';
  t.inputGradient = t.inputGradient || lightGradients?.inputGradient || 'none';
  t.selectedGradient = t.selectedGradient || lightGradients?.selectedGradient || 'none';
  t.buttonGradient = t.buttonGradient || lightGradients?.buttonGradient || t.selectedGradient;
  if (!t.isDark && lightGradients) {
    t.buttonText = resolveReadableText(t.selectedBackground, t.buttonText);
  }
  t.shadow = t.shadow || (t.isDark ? 'rgba(0,0,0,0.6)' : 'rgba(15,23,42,0.12)');
  t.background = t.pageBackground;
  t.active = t.selectedBackground;
  t.hover = t.hoverBackground;
  return t;
}

const THEME_PRESETS = [
  // ---- DARK ----
  { id: 'soft-dark', name: 'Soft Dark', category: 'dark', background: '#17181C', surface: '#22242A', elevatedSurface: '#292C33', primaryText: '#F3F4F6', mutedText: '#A7ADB7', accent: '#8B5CF6', secondaryAccent: '#A78BFA', border: '#343741', link: '#A78BFA', buttonText: '#FFFFFF', isDark: true },
  { id: 'amoled-black', name: 'AMOLED Black', category: 'dark', background: '#000000', secondaryBackground: '#060607', surface: '#101014', elevatedSurface: '#18181D', primaryText: '#F8FAFC', mutedText: '#A8ADB7', accent: '#A855F7', secondaryAccent: '#C4B5FD', border: '#262630', link: '#C4B5FD', buttonBackground: '#7C3AED', buttonText: '#FFFFFF', isDark: true },
  { id: 'midnight-blue', name: 'Midnight Blue', category: 'dark', background: '#0B1220', surface: '#111A2E', primaryText: '#E7ECFA', accent: '#3B82F6', border: '#1F2C47', isDark: true },
  { id: 'charcoal', name: 'Charcoal', category: 'dark', background: '#1B1C1E', surface: '#232426', primaryText: '#EDEDED', accent: '#94A3B8', border: '#333436', isDark: true },
  { id: 'warm-dark', name: 'Warm Dark', category: 'dark', background: '#201A16', surface: '#2A2320', primaryText: '#F5EDE6', accent: '#F59E0B', border: '#3A3129', isDark: true },
  { id: 'dark-purple', name: 'Dark Purple', category: 'dark', background: '#16101F', surface: '#1F1730', primaryText: '#F1EAFB', accent: '#8B5CF6', border: '#31234A', isDark: true },
  { id: 'dark-green', name: 'Dark Green', category: 'dark', background: '#0F1912', surface: '#16231A', primaryText: '#E7F5EB', accent: '#22C55E', border: '#233A28', isDark: true },
  { id: 'dark-rose', name: 'Dark Rose', category: 'dark', background: '#1E0F16', surface: '#2A1620', primaryText: '#FBE7F0', accent: '#EC4899', border: '#3A1F2C', isDark: true },
  { id: 'dark-teal', name: 'Dark Teal', category: 'dark', background: '#0C1A1A', surface: '#132625', primaryText: '#E1F5F3', accent: '#14B8A6', border: '#20403D', isDark: true },
  { id: 'dark-chocolate', name: 'Dark Chocolate', category: 'dark', background: '#1C140F', surface: '#271B14', primaryText: '#F2E6DA', accent: '#B45309', border: '#3A2A1E', isDark: true },

  // ---- SINGLE ----
  { id: 'purple', name: 'Purple', category: 'single', background: '#F7F2FF', secondaryBackground: '#EEE6FF', surface: '#FFFFFF', elevatedSurface: '#FBF9FF', primaryText: '#2D1745', secondaryText: '#5B4370', mutedText: '#79698A', accent: '#8B5CF6', strongAccent: '#7C3AED', softAccent: '#C4B5FD', secondaryAccent: '#C4B5FD', selectedBackground: '#DDD0FA', hoverBackground: '#EDE5FC', border: '#DCCFF1', subtleBorder: '#E9DFF7', inputBackground: '#FFFFFF', inputText: '#2D1745', buttonBackground: '#8B5CF6', buttonText: '#FFFFFF', link: '#7C3AED', linkHover: '#6D28D9', shadow: 'rgba(91, 67, 112, 0.12)' },
  { id: 'pink', name: 'Pink', category: 'single', background: '#FFF3F8', secondaryBackground: '#FDE7F1', surface: '#FFFFFF', elevatedSurface: '#FFF8FC', primaryText: '#3F1729', secondaryText: '#694052', mutedText: '#8A6274', accent: '#EC4899', strongAccent: '#DB2777', softAccent: '#F9A8D4', secondaryAccent: '#F9A8D4', selectedBackground: '#FBCFE8', hoverBackground: '#FCE7F3', border: '#F3C6DA', subtleBorder: '#F8DCE8', inputBackground: '#FFFFFF', inputText: '#3F1729', buttonBackground: '#EC4899', buttonText: '#FFFFFF', link: '#DB2777', linkHover: '#BE185D', shadow: 'rgba(131, 24, 67, 0.12)' },
  { id: 'green', name: 'Green', category: 'single', background: '#F1FBF4', secondaryBackground: '#E5F7EA', surface: '#FFFFFF', elevatedSurface: '#F9FFFA', primaryText: '#163720', secondaryText: '#41664C', mutedText: '#678170', accent: '#22C55E', strongAccent: '#16A34A', softAccent: '#86EFAC', secondaryAccent: '#86EFAC', selectedBackground: '#D2F3DC', hoverBackground: '#E4F8EA', border: '#C9E8D2', subtleBorder: '#DCEFE2', inputBackground: '#FFFFFF', inputText: '#163720', buttonBackground: '#16A34A', buttonText: '#FFFFFF', link: '#15803D', linkHover: '#166534', shadow: 'rgba(22, 101, 52, 0.12)' },
  { id: 'mint', name: 'Mint', category: 'single', background: '#F0FCF8', secondaryBackground: '#E2F8F0', surface: '#FFFFFF', elevatedSurface: '#F9FFFC', primaryText: '#153830', secondaryText: '#416B60', mutedText: '#68867E', accent: '#34D399', strongAccent: '#059669', softAccent: '#A7F3D0', secondaryAccent: '#A7F3D0', selectedBackground: '#CEF3E5', hoverBackground: '#E2F8F0', border: '#C6EADF', subtleBorder: '#D8F2EA', inputBackground: '#FFFFFF', inputText: '#153830', buttonBackground: '#059669', buttonText: '#FFFFFF', link: '#047857', linkHover: '#065F46', shadow: 'rgba(4, 120, 87, 0.12)' },
  { id: 'blue', name: 'Blue', category: 'single', background: '#F1F7FF', secondaryBackground: '#E5F0FF', surface: '#FFFFFF', elevatedSurface: '#F8FBFF', primaryText: '#152B47', secondaryText: '#405C79', mutedText: '#687D94', accent: '#3B82F6', strongAccent: '#2563EB', softAccent: '#93C5FD', secondaryAccent: '#93C5FD', selectedBackground: '#D6E8FF', hoverBackground: '#E7F1FF', border: '#C9DDF7', subtleBorder: '#DCEAFB', inputBackground: '#FFFFFF', inputText: '#152B47', buttonBackground: '#2563EB', buttonText: '#FFFFFF', link: '#2563EB', linkHover: '#1D4ED8', shadow: 'rgba(37, 99, 235, 0.12)' },
  { id: 'red', name: 'Red', category: 'single', background: '#FFF1F0', surface: '#FFFFFF', primaryText: '#411413', accent: '#EF4444', border: '#F5CFCD', link: '#DC2626', buttonText: '#FFFFFF' },
  { id: 'orange', name: 'Orange', category: 'single', background: '#FFF7ED', secondaryBackground: '#FFEDD5', surface: '#FFFFFF', elevatedSurface: '#FFFBF7', primaryText: '#442716', secondaryText: '#72503A', mutedText: '#8D705E', accent: '#F97316', strongAccent: '#EA580C', softAccent: '#FDBA74', secondaryAccent: '#FDBA74', selectedBackground: '#FED7AA', hoverBackground: '#FFEDD5', border: '#F3D2B6', subtleBorder: '#F7E1CF', inputBackground: '#FFFFFF', inputText: '#442716', buttonBackground: '#F97316', buttonText: '#FFFFFF', link: '#EA580C', linkHover: '#C2410C', shadow: 'rgba(194, 65, 12, 0.12)' },
  { id: 'yellow', name: 'Yellow', category: 'single', background: '#FFFBD6', secondaryBackground: '#FFF3A8', surface: '#FFFFFF', primaryText: '#3B3410', accent: '#EAB308', secondaryAccent: '#10B981', border: '#EFE08E', link: '#A16207', buttonBackground: '#EAB308', buttonText: '#3B3410' },
  { id: 'teal', name: 'Teal', category: 'single', background: '#EAFBFA', surface: '#FFFFFF', primaryText: '#0F3433', accent: '#14B8A6', border: '#C4EBE8', link: '#0D9488', buttonText: '#FFFFFF' },
  { id: 'cyan', name: 'Cyan', category: 'single', background: '#EAFAFF', surface: '#FFFFFF', primaryText: '#0B333D', accent: '#06B6D4', border: '#C4EBF5', link: '#0891B2', buttonText: '#FFFFFF' },
  { id: 'lavender', name: 'Lavender', category: 'single', background: '#F4F1FF', surface: '#FFFFFF', primaryText: '#292345', accent: '#A78BFA', border: '#DAD2F5', link: '#7C3AED', buttonText: '#FFFFFF' },
  { id: 'peach', name: 'Peach', category: 'single', background: '#FFF3EC', surface: '#FFFFFF', primaryText: '#432D1F', accent: '#FDBA74', border: '#F6DCC7', link: '#EA580C', buttonText: '#432D1F' },
  { id: 'rose', name: 'Rose', category: 'single', background: '#FFF0F3', surface: '#FFFFFF', primaryText: '#3F1523', accent: '#FB7185', border: '#F6CDD6', link: '#E11D48', buttonText: '#FFFFFF' },
  { id: 'indigo', name: 'Indigo', category: 'single', background: '#EEF0FF', surface: '#FFFFFF', primaryText: '#1D2050', accent: '#6366F1', border: '#D3D7F7', link: '#4F46E5', buttonText: '#FFFFFF' },
  { id: 'coral', name: 'Coral', category: 'single', background: '#FFF1EC', surface: '#FFFFFF', primaryText: '#421F16', accent: '#FF6F59', border: '#F6D3C8', link: '#E14E36', buttonText: '#FFFFFF' },
  { id: 'sky-blue', name: 'Sky Blue', category: 'single', background: '#EAF7FF', surface: '#FFFFFF', primaryText: '#0E2E43', accent: '#38BDF8', border: '#C6E8F7', link: '#0284C7', buttonText: '#0E2E43' },
  { id: 'lime', name: 'Lime', category: 'single', background: '#F6FEE7', surface: '#FFFFFF', primaryText: '#293B0B', accent: '#84CC16', border: '#E1F2BE', link: '#4D7C0F', buttonText: '#FFFFFF' },
  { id: 'burgundy', name: 'Burgundy', category: 'single', background: '#241014', surface: '#2E1620', primaryText: '#F6E6EA', accent: '#9F1239', border: '#3E202A', isDark: true, link: '#FB7185', buttonText: '#FFFFFF' },

  // ---- COMBOS ----
  { id: 'purple-pink', name: 'Purple + Pink', category: 'combos', background: '#FBF2FF', surface: '#FFFFFF', primaryText: '#35173D', mutedText: '#806287', accent: '#8B5CF6', secondaryAccent: '#EC4899', border: '#E8D2EF', link: '#C026D3', buttonText: '#FFFFFF' },
  { id: 'purple-blue', name: 'Purple + Blue', category: 'combos', background: '#F2F4FF', surface: '#FFFFFF', primaryText: '#202748', mutedText: '#666E91', accent: '#8B5CF6', secondaryAccent: '#3B82F6', border: '#D6DAF1', link: '#4F46E5', buttonText: '#FFFFFF' },
  { id: 'purple-gold', name: 'Purple + Gold', category: 'combos', background: '#F8F3FF', surface: '#FFFFFF', primaryText: '#2E1A45', accent: '#8B5CF6', secondaryAccent: '#EAB308', border: '#E3D6F4', link: '#7C3AED', buttonText: '#FFFFFF' },
  { id: 'purple-mint', name: 'Purple + Mint', category: 'combos', background: '#F5F1FF', surface: '#FFFFFF', primaryText: '#211B3C', accent: '#8B5CF6', secondaryAccent: '#34D399', border: '#DED6F6', link: '#7C3AED', buttonText: '#FFFFFF' },
  { id: 'pink-blue', name: 'Pink + Blue', category: 'combos', background: '#FFF1F7', surface: '#FFFFFF', primaryText: '#331B3B', accent: '#EC4899', secondaryAccent: '#3B82F6', border: '#F4CFE3', link: '#DB2777', buttonText: '#FFFFFF' },
  { id: 'pink-mint', name: 'Pink + Mint', category: 'combos', background: '#FFF1F7', surface: '#FFFFFF', primaryText: '#331B2C', accent: '#EC4899', secondaryAccent: '#34D399', border: '#F4CFE3', link: '#DB2777', buttonText: '#FFFFFF' },
  { id: 'pink-purple', name: 'Pink + Purple', category: 'combos', background: '#FDF0FA', surface: '#FFFFFF', primaryText: '#3A1638', accent: '#EC4899', secondaryAccent: '#8B5CF6', border: '#F1D3EA', link: '#C026D3', buttonText: '#FFFFFF' },
  { id: 'pink-gold', name: 'Pink + Gold', category: 'combos', background: '#FFF3EA', surface: '#FFFFFF', primaryText: '#3A2016', accent: '#EC4899', secondaryAccent: '#EAB308', border: '#F1DAC4', link: '#DB2777', buttonText: '#FFFFFF' },
  { id: 'green-gold', name: 'Green + Gold', category: 'combos', background: '#F6FAEE', surface: '#FFFFFF', primaryText: '#26351B', mutedText: '#6D795F', accent: '#2F9E44', secondaryAccent: '#EAB308', border: '#DDE6C7', link: '#2F7D32', buttonText: '#FFFFFF' },
  { id: 'green-blue', name: 'Green + Blue', category: 'combos', background: '#EEFAF3', surface: '#FFFFFF', primaryText: '#123321', accent: '#22C55E', secondaryAccent: '#3B82F6', border: '#CCEBDA', link: '#0891B2', buttonText: '#FFFFFF' },
  { id: 'green-mint', name: 'Green + Mint', category: 'combos', background: '#EFFBF2', surface: '#FFFFFF', primaryText: '#123321', accent: '#22C55E', secondaryAccent: '#34D399', border: '#CCEBDA', link: '#15803D', buttonText: '#FFFFFF' },
  { id: 'mint-lavender', name: 'Mint + Lavender', category: 'combos', background: '#F1FCF8', surface: '#FFFFFF', primaryText: '#223638', mutedText: '#687D80', accent: '#34D399', secondaryAccent: '#A78BFA', border: '#D4EAE4', link: '#7C3AED', buttonText: '#FFFFFF' },
  { id: 'mint-peach', name: 'Mint + Peach', category: 'combos', background: '#F1FCF8', surface: '#FFFFFF', primaryText: '#223638', accent: '#34D399', secondaryAccent: '#FDBA74', border: '#D4EAE4', link: '#059669', buttonText: '#FFFFFF' },
  { id: 'mint-blue', name: 'Mint + Blue', category: 'combos', background: '#EEFCF9', surface: '#FFFFFF', primaryText: '#12332F', accent: '#34D399', secondaryAccent: '#3B82F6', border: '#CCEAE3', link: '#0891B2', buttonText: '#FFFFFF' },
  { id: 'blue-purple', name: 'Blue + Purple', category: 'combos', background: '#F2F4FF', surface: '#FFFFFF', primaryText: '#202748', accent: '#2563EB', secondaryAccent: '#8B5CF6', border: '#D6DAF1', link: '#4F46E5', buttonText: '#FFFFFF' },
  { id: 'blue-cyan', name: 'Blue + Cyan', category: 'combos', background: '#EAF6FF', surface: '#FFFFFF', primaryText: '#0F2C43', accent: '#2563EB', secondaryAccent: '#06B6D4', border: '#C7E4F7', link: '#0891B2', buttonText: '#FFFFFF' },
  { id: 'blue-gold', name: 'Blue + Gold', category: 'combos', background: '#EFF6FF', surface: '#FFFFFF', primaryText: '#142B4A', accent: '#3B82F6', secondaryAccent: '#EAB308', border: '#C9DDF8', link: '#2563EB', buttonText: '#FFFFFF' },
  { id: 'blue-pink', name: 'Blue + Pink', category: 'combos', background: '#EFF6FF', surface: '#FFFFFF', primaryText: '#142B4A', accent: '#3B82F6', secondaryAccent: '#EC4899', border: '#C9DDF8', link: '#DB2777', buttonText: '#FFFFFF' },
  { id: 'orange-yellow', name: 'Orange + Yellow', category: 'combos', background: '#FFF8E8', surface: '#FFFFFF', primaryText: '#422A10', mutedText: '#8A735B', accent: '#F97316', secondaryAccent: '#FACC15', border: '#F2DFC0', link: '#EA580C', buttonText: '#FFFFFF' },
  { id: 'orange-pink', name: 'Orange + Pink', category: 'combos', background: '#FFF3EC', surface: '#FFFFFF', primaryText: '#432117', accent: '#F97316', secondaryAccent: '#EC4899', border: '#F3D9CB', link: '#DB2777', buttonText: '#FFFFFF' },
  { id: 'orange-purple', name: 'Orange + Purple', category: 'combos', background: '#FFF4EC', surface: '#FFFFFF', primaryText: '#3A2317', accent: '#F97316', secondaryAccent: '#8B5CF6', border: '#F1DCC9', link: '#7C3AED', buttonText: '#FFFFFF' },
  { id: 'red-orange', name: 'Red + Orange', category: 'combos', background: '#FFF1EC', surface: '#FFFFFF', primaryText: '#421A11', accent: '#EF4444', secondaryAccent: '#F97316', border: '#F6D2C6', link: '#DC2626', buttonText: '#FFFFFF' },
  { id: 'red-gold', name: 'Red + Gold', category: 'combos', background: '#FFF2E8', surface: '#FFFFFF', primaryText: '#3E1E12', accent: '#DC2626', secondaryAccent: '#EAB308', border: '#F1DAC4', link: '#B91C1C', buttonText: '#FFFFFF' },
  { id: 'red-black', name: 'Red + Black', category: 'combos', background: '#160B0B', surface: '#211010', primaryText: '#FBE9E9', accent: '#EF4444', secondaryAccent: '#F87171', border: '#332020', isDark: true, link: '#F87171', buttonText: '#FFFFFF' },
  { id: 'teal-purple', name: 'Teal + Purple', category: 'combos', background: '#EAFBFA', surface: '#FFFFFF', primaryText: '#0F3433', accent: '#14B8A6', secondaryAccent: '#8B5CF6', border: '#C4EBE8', link: '#7C3AED', buttonText: '#FFFFFF' },
  { id: 'teal-mint', name: 'Teal + Mint', category: 'combos', background: '#EAFBFA', surface: '#FFFFFF', primaryText: '#0F3433', accent: '#14B8A6', secondaryAccent: '#34D399', border: '#C4EBE8', link: '#0D9488', buttonText: '#FFFFFF' },
  { id: 'teal-blue', name: 'Teal + Blue', category: 'combos', background: '#EAFAFB', surface: '#FFFFFF', primaryText: '#0E3037', accent: '#14B8A6', secondaryAccent: '#3B82F6', border: '#C2E8EC', link: '#2563EB', buttonText: '#FFFFFF' },
  { id: 'black-gold', name: 'Black + Gold', category: 'combos', background: '#080808', surface: '#151515', primaryText: '#FFF8DC', accent: '#EAB308', secondaryAccent: '#FDE68A', border: '#38301D', isDark: true, link: '#FACC15', buttonText: '#111111' },
  { id: 'black-red', name: 'Black + Red', category: 'combos', background: '#0C0808', surface: '#171010', primaryText: '#FBE9E9', accent: '#EF4444', border: '#332020', isDark: true, link: '#F87171', buttonText: '#FFFFFF' },
  { id: 'black-purple', name: 'Black + Purple', category: 'combos', background: '#0B080F', surface: '#151020', primaryText: '#F1EAFB', accent: '#A855F7', border: '#2B2038', isDark: true, link: '#C084FC', buttonText: '#FFFFFF' },
  { id: 'cream-brown', name: 'Cream + Brown', category: 'combos', background: '#FBF3E6', surface: '#FFFFFF', primaryText: '#3B2A1B', accent: '#92400E', secondaryAccent: '#C2884E', border: '#E8DAC0', link: '#78350F', buttonText: '#FFFFFF' },

  // ---- STYLES ----
  { id: 'pastel-dream', name: 'Pastel Dream', category: 'styles', background: '#FDF6FF', surface: '#FFFFFF', primaryText: '#3A2E45', accent: '#C4B5FD', secondaryAccent: '#F9A8D4', border: '#EEE0F5', link: '#A78BFA', buttonText: '#3A2E45' },
  { id: 'cotton-candy', name: 'Cotton Candy', category: 'styles', background: '#FFF4FB', surface: '#FFFFFF', primaryText: '#38233F', mutedText: '#806D86', accent: '#F472B6', secondaryAccent: '#60A5FA', border: '#ECD8E8', link: '#DB2777', buttonText: '#FFFFFF' },
  { id: 'ocean-breeze', name: 'Ocean Breeze', category: 'styles', background: '#EDF9FC', surface: '#FFFFFF', primaryText: '#12343D', mutedText: '#5D7C83', accent: '#0891B2', secondaryAccent: '#2DD4BF', border: '#C7E7EC', link: '#0E7490', buttonText: '#FFFFFF' },
  { id: 'forest-calm', name: 'Forest Calm', category: 'styles', background: '#EFF7EE', surface: '#FFFFFF', primaryText: '#1B3320', accent: '#2F9E44', secondaryAccent: '#6EC086', border: '#D2E7CF', link: '#2B8A3E', buttonText: '#FFFFFF' },
  { id: 'sunset-glow', name: 'Sunset Glow', category: 'styles', background: '#FFF4ED', surface: '#FFFFFF', primaryText: '#45251E', mutedText: '#8D6A61', accent: '#F97316', secondaryAccent: '#EC4899', border: '#F0D3C8', link: '#E11D48', buttonText: '#FFFFFF' },
  { id: 'aurora', name: 'Aurora', category: 'styles', background: '#0E1A1E', surface: '#152229', primaryText: '#E4FBF3', accent: '#22D3EE', secondaryAccent: '#34D399', border: '#22343A', isDark: true, link: '#67E8F9', buttonText: '#04222A' },
  { id: 'cyberpunk', name: 'Cyberpunk', category: 'styles', background: '#090318', surface: '#160A2D', elevatedSurface: '#20103D', primaryText: '#F5EFFF', mutedText: '#A698BA', accent: '#E600FF', secondaryAccent: '#00E5FF', border: '#4D1762', isDark: true, link: '#00E5FF', buttonText: '#08000E' },
  { id: 'neon-night', name: 'Neon Night', category: 'styles', background: '#08090F', surface: '#111320', primaryText: '#EAF7FF', accent: '#39FF14', secondaryAccent: '#FF2E9A', border: '#232637', isDark: true, link: '#39FF14', buttonText: '#08090F' },
  { id: 'royal-purple', name: 'Royal Purple', category: 'styles', background: '#1B0F30', surface: '#25143F', primaryText: '#F3ECFF', accent: '#A855F7', secondaryAccent: '#EAB308', border: '#3A2358', isDark: true, link: '#D8B4FE', buttonText: '#FFFFFF' },
  { id: 'rose-gold', name: 'Rose Gold', category: 'styles', background: '#FFF3F1', surface: '#FFFFFF', primaryText: '#432420', accent: '#E8A798', secondaryAccent: '#EAB308', border: '#F3D9D2', link: '#C2410C', buttonText: '#432420' },
  { id: 'coffee-cream', name: 'Coffee Cream', category: 'styles', background: '#FBF3E9', surface: '#FFFFFF', primaryText: '#3B2A1E', accent: '#7C5A3A', secondaryAccent: '#D6B98C', border: '#E9DAC4', link: '#78350F', buttonText: '#FFFFFF' },
  { id: 'ice-blue', name: 'Ice Blue', category: 'styles', background: '#EEF8FF', surface: '#FFFFFF', primaryText: '#12324A', accent: '#7DD3FC', secondaryAccent: '#38BDF8', border: '#CFE9F8', link: '#0284C7', buttonText: '#12324A' },
  { id: 'sakura', name: 'Sakura', category: 'styles', background: '#FFF3F6', surface: '#FFFFFF', primaryText: '#402431', accent: '#FBCFE8', secondaryAccent: '#F472B6', border: '#F6DDE6', link: '#DB2777', buttonText: '#402431' },
  { id: 'tropical', name: 'Tropical', category: 'styles', background: '#EEFCF4', surface: '#FFFFFF', primaryText: '#0F3D2E', accent: '#10B981', secondaryAccent: '#FACC15', border: '#CBEEDC', link: '#059669', buttonText: '#FFFFFF' },
  { id: 'retro', name: 'Retro', category: 'styles', background: '#FBF0DA', surface: '#FFFFFF', primaryText: '#3A2612', accent: '#D97706', secondaryAccent: '#DC2626', border: '#EEDDB4', link: '#B45309', buttonText: '#FFFFFF' },
  { id: 'monochrome', name: 'Monochrome', category: 'styles', background: '#F5F5F5', surface: '#FFFFFF', primaryText: '#111111', accent: '#404040', secondaryAccent: '#8A8A8A', border: '#D9D9D9', link: '#111111', buttonText: '#FFFFFF' },
  { id: 'grayscale', name: 'Grayscale', category: 'styles', background: '#EDEDED', surface: '#FAFAFA', primaryText: '#1A1A1A', accent: '#595959', border: '#D0D0D0', link: '#1A1A1A', buttonText: '#FFFFFF' },
  { id: 'high-contrast', name: 'High Contrast', category: 'styles', background: '#000000', surface: '#000000', primaryText: '#FFFFFF', accent: '#FFFF00', border: '#FFFFFF', isDark: true, link: '#00FFFF', buttonText: '#000000' },
  { id: 'candy-pop', name: 'Candy Pop', category: 'styles', background: '#FFF0F6', surface: '#FFFFFF', primaryText: '#3A1230', accent: '#FF3EA5', secondaryAccent: '#FFD23F', border: '#F7D0E5', link: '#DB2777', buttonText: '#FFFFFF' },
  { id: 'galaxy', name: 'Galaxy', category: 'styles', background: '#0A0A20', surface: '#12122E', primaryText: '#E8E8FF', accent: '#7C3AED', secondaryAccent: '#38BDF8', border: '#26264A', isDark: true, link: '#93C5FD', buttonText: '#FFFFFF' },
  { id: 'mermaid', name: 'Mermaid', category: 'styles', background: '#EAFBFA', surface: '#FFFFFF', primaryText: '#0C3B3A', accent: '#06B6D4', secondaryAccent: '#8B5CF6', border: '#C6EEEC', link: '#0891B2', buttonText: '#FFFFFF' },
  { id: 'peach-blossom', name: 'Peach Blossom', category: 'styles', background: '#FFF3EC', surface: '#FFFFFF', primaryText: '#432B1E', accent: '#FDBA74', secondaryAccent: '#F9A8D4', border: '#F3DCC8', link: '#EA580C', buttonText: '#432B1E' },
  { id: 'lemon-mint', name: 'Lemon Mint', category: 'styles', background: '#FBFDE7', surface: '#FFFFFF', primaryText: '#2B3311', accent: '#D9F99D', secondaryAccent: '#34D399', border: '#E9EEC4', link: '#4D7C0F', buttonText: '#2B3311' },
  { id: 'electric-blue', name: 'Electric Blue', category: 'styles', background: '#081226', surface: '#0F1E3D', primaryText: '#E7F0FF', accent: '#2563EB', secondaryAccent: '#38BDF8', border: '#1B2E52', isDark: true, link: '#60A5FA', buttonText: '#FFFFFF' },
  { id: 'flamingo', name: 'Flamingo', category: 'styles', background: '#FFF0F4', surface: '#FFFFFF', primaryText: '#401A28', accent: '#FB7185', secondaryAccent: '#FDBA74', border: '#F6D3DC', link: '#E11D48', buttonText: '#FFFFFF' },
  { id: 'cozy-beige', name: 'Cozy Beige', category: 'styles', background: '#F7F1E6', surface: '#FFFFFF', primaryText: '#3A331F', accent: '#B08968', secondaryAccent: '#D6B98C', border: '#E7DCC2', link: '#78350F', buttonText: '#FFFFFF' },
  { id: 'rainy-day', name: 'Rainy Day', category: 'styles', background: '#EEF1F5', surface: '#FFFFFF', primaryText: '#1F2937', accent: '#64748B', secondaryAccent: '#94A3B8', border: '#D9DFE7', link: '#475569', buttonText: '#FFFFFF' },
  { id: 'arctic', name: 'Arctic', category: 'styles', background: '#F1FAFF', surface: '#FFFFFF', primaryText: '#0E2E3D', accent: '#7DD3FC', secondaryAccent: '#BAE6FD', border: '#D2ECF8', link: '#0284C7', buttonText: '#0E2E3D' },
  { id: 'halloween', name: 'Halloween', category: 'styles', background: '#12100A', surface: '#1E1A10', primaryText: '#FDECC8', accent: '#F97316', secondaryAccent: '#7C3AED', border: '#332C18', isDark: true, link: '#FDBA74', buttonText: '#12100A' },
  { id: 'christmas', name: 'Christmas', category: 'styles', background: '#0F1D14', surface: '#17281C', primaryText: '#F1FBF3', accent: '#DC2626', secondaryAccent: '#22C55E', border: '#243A2B', isDark: true, link: '#F87171', buttonText: '#FFFFFF' },
  { id: 'spring-garden', name: 'Spring Garden', category: 'styles', background: '#F3FBEE', surface: '#FFFFFF', primaryText: '#1F3315', accent: '#84CC16', secondaryAccent: '#F9A8D4', border: '#DDEECB', link: '#4D7C0F', buttonText: '#1F3315' }
].map(buildTheme);

const THEME_MAP = Object.fromEntries(THEME_PRESETS.map(t => [t.id, t]));

function hexToHsl(hex) {
  const { r, g, b } = Utilities.hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  const d = max - min;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

function hslToHex(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const sat = Utilities.clamp(s, 0, 100) / 100;
  const light = Utilities.clamp(l, 0, 100) / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return Utilities.rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

function rgbaFromHex(hex, alpha) {
  const { r, g, b } = Utilities.hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function hslFromBase(baseHsl, saturation, lightness, hueShift = 0) {
  return hslToHex(baseHsl.h + hueShift, saturation, lightness);
}

function getThemeBaseColor(theme) {
  return theme.baseColor || theme.accent || theme.strongAccent || theme.secondaryAccent || '#8B5CF6';
}

function forceTextTone(color, theme, options = {}) {
  const minContrast = options.minContrast || 4.5;
  const targetLuminance = options.targetLuminance;
  const background = options.background || theme.surface || theme.pageBackground;
  let next = color;
  let attempts = 0;
  while (attempts < 18) {
    const luminance = Utilities.relativeLuminance(next);
    const hasContrast = Utilities.contrastRatio(next, background) >= minContrast;
    const hasTone = theme.isDark ? luminance >= targetLuminance : luminance <= targetLuminance;
    if (hasTone && hasContrast) return next;
    next = theme.isDark ? Utilities.lighten(next, 0.08) : Utilities.darken(next, 0.08);
    attempts += 1;
  }
  return ensureTextContrast(next, background, minContrast);
}

function strengthenTextTone(theme) {
  const surface = theme.surface || theme.pageBackground;
  const inputSurface = theme.inputBackground || surface;
  const selectedSurface = theme.selectedBackground || surface;
  const buttonSurface = theme.buttonBackground || selectedSurface;
  const secondaryButtonSurface = theme.secondaryButtonBackground || surface;

  const tones = theme.isDark
    ? {
      primary: 0.84,
      secondary: 0.7,
      muted: 0.54,
      link: 0.62,
      minimumPrimary: 7,
      minimumBody: 5.2
    }
    : {
      primary: 0.06,
      secondary: 0.1,
      muted: 0.14,
      link: 0.12,
      minimumPrimary: 7,
      minimumBody: 5.2
    };

  theme.primaryText = forceTextTone(theme.primaryText, theme, {
    background: surface,
    targetLuminance: tones.primary,
    minContrast: tones.minimumPrimary
  });
  theme.secondaryText = forceTextTone(theme.secondaryText, theme, {
    background: surface,
    targetLuminance: tones.secondary,
    minContrast: tones.minimumBody
  });
  theme.mutedText = forceTextTone(theme.mutedText, theme, {
    background: surface,
    targetLuminance: tones.muted,
    minContrast: 4.8
  });
  theme.inputText = forceTextTone(theme.inputText || theme.primaryText, theme, {
    background: inputSurface,
    targetLuminance: tones.primary,
    minContrast: tones.minimumPrimary
  });
  theme.link = forceTextTone(theme.link, theme, {
    background: surface,
    targetLuminance: tones.link,
    minContrast: 4.8
  });
  theme.linkHover = forceTextTone(theme.linkHover || theme.link, theme, {
    background: surface,
    targetLuminance: theme.isDark ? tones.primary : tones.primary,
    minContrast: 5.2
  });
  theme.secondaryButtonText = forceTextTone(theme.secondaryButtonText || theme.primaryText, theme, {
    background: secondaryButtonSurface,
    targetLuminance: tones.primary,
    minContrast: 5.2
  });
  theme.selectedText = forceTextTone(theme.selectedText || theme.primaryText, theme, {
    background: selectedSurface,
    targetLuminance: theme.isDark ? tones.primary : tones.primary,
    minContrast: 5.2
  });
  theme.buttonText = forceTextTone(theme.buttonText || resolveReadableText(buttonSurface), theme, {
    background: buttonSurface,
    targetLuminance: Utilities.relativeLuminance(buttonSurface) < 0.42 ? 0.88 : tones.primary,
    minContrast: 5.2
  });
}

function buildLightGradients(theme) {
  const color = Utilities.isValidHex(getThemeBaseColor(theme)) ? getThemeBaseColor(theme) : '#8B5CF6';
  const hsl = hexToHsl(color);
  const accentSat = Utilities.clamp(Math.max(hsl.s, 68), 58, 96);
  const tintSat = Utilities.clamp(Math.max(hsl.s * 0.42, 24), 22, 58);
  const strongGlow = hslFromBase(hsl, accentSat, 68);
  const softGlow = hslFromBase(hsl, Utilities.clamp(accentSat - 6, 58, 92), 78);
  const paleGlow = hslFromBase(hsl, Utilities.clamp(tintSat + 22, 44, 78), 88);
  const paleTint = hslFromBase(hsl, Utilities.clamp(tintSat + 10, 28, 68), 95);
  const surfaceTint = hslFromBase(hsl, Utilities.clamp(tintSat + 12, 30, 70), 98);
  const pageBackground = theme.pageBackground || '#F8FAFC';
  const secondaryBackground = theme.secondaryBackground || paleTint;
  const gradientStart = Utilities.mixColors(pageBackground, color, 0.16);
  const gradientEnd = Utilities.mixColors(secondaryBackground, color, 0.18);
  const surface = theme.surface || '#FFFFFF';
  const elevatedSurface = theme.elevatedSurface || surfaceTint;
  const sidebarBackground = theme.sidebarBackground || secondaryBackground;
  const cardBackground = theme.cardBackground || surface;
  const inputBackground = theme.inputBackground || surface;
  const menuBackground = theme.menuBackground || elevatedSurface;
  const hoverBackground = theme.hoverBackground || paleTint;
  const subtleAccentSurface = theme.subtleAccentSurface || paleTint;
  const selectedBackground = theme.selectedBackground || hslFromBase(hsl, Utilities.clamp(tintSat + 22, 44, 82), 88);
  const selectedEnd = theme.hoverBackground || hslFromBase(hsl, Utilities.clamp(tintSat + 10, 30, 70), 94);

  return {
    screenGradient: [
      `linear-gradient(90deg, ${rgbaFromHex(strongGlow, 0.3)} 0%, ${rgbaFromHex(softGlow, 0.19)} 18%, transparent 42%)`,
      `radial-gradient(circle at 18% 0%, ${rgbaFromHex(strongGlow, 0.52)} 0, transparent 34rem)`,
      `radial-gradient(circle at 50% 4%, ${rgbaFromHex(strongGlow, 0.24)} 0, transparent 28rem)`,
      `radial-gradient(circle at 68% 6%, ${rgbaFromHex(strongGlow, 0.26)} 0, transparent 30rem)`,
      `radial-gradient(circle at 86% 12%, ${rgbaFromHex(softGlow, 0.4)} 0, transparent 32rem)`,
      `radial-gradient(circle at 50% 56%, ${rgbaFromHex(paleGlow, 0.34)} 0, transparent 44rem)`,
      `linear-gradient(135deg, ${gradientStart} 0%, ${pageBackground} 46%, ${gradientEnd} 100%)`
    ].join(', '),
    headerGradient: `linear-gradient(135deg, ${surface} 0%, ${elevatedSurface} 48%, ${hoverBackground} 100%)`,
    sidebarGradient: `linear-gradient(180deg, ${sidebarBackground} 0%, ${pageBackground} 100%)`,
    surfaceGradient: `linear-gradient(145deg, ${surface} 0%, ${elevatedSurface} 58%, ${subtleAccentSurface} 100%)`,
    cardGradient: `linear-gradient(145deg, ${cardBackground} 0%, ${surfaceTint} 62%, ${surface} 100%)`,
    menuGradient: `linear-gradient(145deg, ${menuBackground} 0%, ${surfaceTint} 58%, ${surface} 100%)`,
    inputGradient: `linear-gradient(135deg, ${inputBackground} 0%, ${elevatedSurface} 100%)`,
    selectedGradient: `linear-gradient(135deg, ${selectedBackground} 0%, ${selectedEnd} 100%)`,
    buttonGradient: `linear-gradient(135deg, ${selectedBackground} 0%, ${selectedEnd} 100%)`
  };
}

function generateDarkTheme(baseColor, options = {}) {
  const color = Utilities.isValidHex(baseColor) ? baseColor : '#8B5CF6';
  const base = options.baseTheme || {};
  const mode = options.mode === 'amoled' || options.amoled ? 'amoled' : 'dark';
  const hsl = hexToHsl(color);
  const accentSat = Utilities.clamp(Math.max(hsl.s, 78), 70, 96);
  const bgSat = Utilities.clamp(Math.max(hsl.s * 0.56, 42), 34, 64);
  const surfaceSat = Utilities.clamp(bgSat + 4, 38, 70);
  const isAmoled = mode === 'amoled';
  const blackBase = isAmoled ? '#000000' : hslFromBase(hsl, bgSat, 2.4);
  const deepestBackground = isAmoled ? '#000000' : hslFromBase(hsl, bgSat, 4.2);
  const pageBackground = isAmoled ? '#000000' : hslFromBase(hsl, bgSat, 6.8);
  const accent = hslFromBase(hsl, accentSat, Utilities.clamp(Math.max(hsl.l, 56), 52, 65));
  const strongAccent = hslFromBase(hsl, Utilities.clamp(accentSat + 4, 78, 100), 47);
  const brightAccent = hslFromBase(hsl, Utilities.clamp(accentSat + 2, 78, 100), 68);
  const softAccent = hslFromBase(hsl, Utilities.clamp(accentSat - 4, 68, 96), 78);
  const selectedBackground = hslFromBase(hsl, Utilities.clamp(accentSat, 72, 100), isAmoled ? 35 : 34);
  const buttonBackground = hslFromBase(hsl, Utilities.clamp(accentSat, 74, 100), isAmoled ? 48 : 46);
  const gradientLow = hslFromBase(hsl, bgSat, isAmoled ? 4 : 7);
  const gradientMid = hslFromBase(hsl, surfaceSat, isAmoled ? 9 : 15);
  const gradientHigh = hslFromBase(hsl, Utilities.clamp(surfaceSat + 10, 50, 82), isAmoled ? 15 : 24);
  const screenGradient = [
    `linear-gradient(90deg, ${rgbaFromHex(accent, isAmoled ? 0.16 : 0.13)} 0%, ${rgbaFromHex(strongAccent, isAmoled ? 0.1 : 0.085)} 18%, transparent 44%)`,
    `radial-gradient(circle at 20% 0%, ${rgbaFromHex(brightAccent, isAmoled ? 0.34 : 0.3)} 0, transparent 38rem)`,
    `radial-gradient(circle at 82% 10%, ${rgbaFromHex(accent, isAmoled ? 0.32 : 0.26)} 0, transparent 34rem)`,
    `radial-gradient(circle at 50% 46%, ${rgbaFromHex(strongAccent, isAmoled ? 0.16 : 0.14)} 0, transparent 42rem)`,
    `linear-gradient(135deg, ${deepestBackground} 0%, ${pageBackground} 48%, ${gradientLow} 100%)`
  ].join(', ');
  const headerGradient = `linear-gradient(135deg, ${hslFromBase(hsl, surfaceSat, isAmoled ? 8 : 13)} 0%, ${gradientHigh} 100%)`;
  const sidebarGradient = `linear-gradient(180deg, ${hslFromBase(hsl, surfaceSat, isAmoled ? 7 : 12)} 0%, ${hslFromBase(hsl, surfaceSat, isAmoled ? 4.8 : 9)} 100%)`;
  const surfaceGradient = `linear-gradient(145deg, ${hslFromBase(hsl, surfaceSat, isAmoled ? 5 : 12)} 0%, ${hslFromBase(hsl, surfaceSat, isAmoled ? 8.5 : 17)} 100%)`;
  const cardGradient = `linear-gradient(145deg, ${hslFromBase(hsl, surfaceSat, isAmoled ? 4.5 : 10.5)} 0%, ${gradientMid} 100%)`;
  const menuGradient = `linear-gradient(145deg, ${hslFromBase(hsl, surfaceSat, isAmoled ? 7 : 13)} 0%, ${hslFromBase(hsl, surfaceSat, isAmoled ? 10.5 : 19)} 100%)`;
  const inputGradient = `linear-gradient(135deg, ${hslFromBase(hsl, bgSat, isAmoled ? 3.8 : 8)} 0%, ${hslFromBase(hsl, bgSat, isAmoled ? 6.5 : 12)} 100%)`;
  const selectedGradient = `linear-gradient(135deg, ${selectedBackground} 0%, ${buttonBackground} 100%)`;

  return buildTheme({
    ...base,
    id: base.id,
    name: base.name,
    category: base.category,
    mode,
    displayMode: mode,
    baseColor: color,
    blackBase,
    deepestBackground,
    pageBackground,
    background: pageBackground,
    secondaryBackground: hslFromBase(hsl, bgSat, isAmoled ? 4.5 : 9.6),
    headerBackground: hslFromBase(hsl, surfaceSat, isAmoled ? 7.5 : 11.8),
    sidebarBackground: hslFromBase(hsl, surfaceSat, isAmoled ? 5.8 : 9.8),
    surface: hslFromBase(hsl, surfaceSat, isAmoled ? 5.2 : 12.4),
    elevatedSurface: hslFromBase(hsl, surfaceSat, isAmoled ? 8.2 : 16.8),
    cardBackground: hslFromBase(hsl, surfaceSat, isAmoled ? 4.6 : 10.8),
    inputBackground: hslFromBase(hsl, bgSat, isAmoled ? 4.2 : 8.6),
    menuBackground: hslFromBase(hsl, surfaceSat, isAmoled ? 8 : 13.4),
    subtleAccentSurface: hslFromBase(hsl, surfaceSat, isAmoled ? 10.2 : 18.6),
    primaryText: hslFromBase(hsl, 18, 98),
    secondaryText: hslFromBase(hsl, 42, 90),
    mutedText: hslFromBase(hsl, 30, 72),
    inverseText: hslFromBase(hsl, surfaceSat, 8),
    accent,
    strongAccent,
    brightAccent,
    softAccent,
    selectedBackground,
    hoverBackground: hslFromBase(hsl, surfaceSat, isAmoled ? 15 : 22),
    border: hslFromBase(hsl, Utilities.clamp(bgSat + 8, 44, 74), isAmoled ? 24 : 29),
    strongBorder: accent,
    buttonBackground,
    buttonText: resolveReadableText(buttonBackground),
    secondaryButtonBackground: hslFromBase(hsl, surfaceSat, isAmoled ? 8.8 : 17.5),
    secondaryButtonText: hslFromBase(hsl, 30, 94),
    selectedText: resolveReadableText(selectedBackground),
    link: brightAccent,
    linkHover: softAccent,
    glow: rgbaFromHex(accent, isAmoled ? 0.42 : 0.34),
    screenGradient,
    headerGradient,
    sidebarGradient,
    surfaceGradient,
    cardGradient,
    menuGradient,
    inputGradient,
    selectedGradient,
    buttonGradient: selectedGradient,
    shadow: 'rgba(0, 0, 0, 0.48)',
    isDark: true
  });
}

function generateLightTheme(baseColor, options = {}) {
  const color = Utilities.isValidHex(baseColor) ? baseColor : '#8B5CF6';
  const base = options.baseTheme || {};
  const hsl = hexToHsl(color);
  const accentSat = Utilities.clamp(Math.max(hsl.s, 68), 58, 94);
  const tintSat = Utilities.clamp(Math.max(hsl.s * 0.45, 28), 22, 55);
  const primaryText = hslFromBase(hsl, Utilities.clamp(tintSat + 8, 34, 64), 16);
  const buttonBackground = hslFromBase(hsl, accentSat, Utilities.clamp(hsl.l, 45, 58));
  return buildTheme({
    ...base,
    mode: 'light',
    displayMode: 'light',
    baseColor: color,
    pageBackground: hslFromBase(hsl, tintSat, 97),
    background: hslFromBase(hsl, tintSat, 97),
    secondaryBackground: hslFromBase(hsl, tintSat, 94),
    headerBackground: '#FFFFFF',
    sidebarBackground: hslFromBase(hsl, tintSat, 95),
    surface: '#FFFFFF',
    elevatedSurface: hslFromBase(hsl, tintSat, 99),
    cardBackground: '#FFFFFF',
    inputBackground: '#FFFFFF',
    menuBackground: '#FFFFFF',
    primaryText,
    secondaryText: hslFromBase(hsl, 24, 34),
    mutedText: hslFromBase(hsl, 18, 48),
    inverseText: '#FFFFFF',
    accent: hslFromBase(hsl, accentSat, Utilities.clamp(hsl.l, 52, 62)),
    strongAccent: hslFromBase(hsl, accentSat, 44),
    brightAccent: hslFromBase(hsl, accentSat, 62),
    softAccent: hslFromBase(hsl, tintSat + 20, 82),
    selectedBackground: hslFromBase(hsl, tintSat + 24, 88),
    hoverBackground: hslFromBase(hsl, tintSat + 8, 94),
    border: hslFromBase(hsl, tintSat, 84),
    strongBorder: hslFromBase(hsl, accentSat, 56),
    buttonBackground,
    buttonText: resolveReadableText(buttonBackground),
    secondaryButtonBackground: hslFromBase(hsl, tintSat, 96),
    secondaryButtonText: primaryText,
    link: hslFromBase(hsl, accentSat, 42),
    linkHover: hslFromBase(hsl, accentSat, 34),
    glow: rgbaFromHex(color, 0.18),
    screenGradient: null,
    headerGradient: null,
    sidebarGradient: null,
    surfaceGradient: null,
    cardGradient: null,
    menuGradient: null,
    inputGradient: null,
    selectedGradient: null,
    buttonGradient: null,
    shadow: 'rgba(15, 23, 42, 0.12)',
    isDark: false
  });
}

function resolveDisplayMode(mode) {
  if (mode === 'auto') {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  }
  return ['light', 'dark', 'amoled'].includes(mode) ? mode : 'light';
}

function resolveThemeForDisplayMode(theme, options = {}) {
  const mode = resolveDisplayMode(options.displayMode || theme.displayMode || 'light');
  const baseColor = getThemeBaseColor(theme);
  if (mode === 'dark' || mode === 'amoled') {
    return generateDarkTheme(baseColor, { baseTheme: theme, mode });
  }
  if (theme.isDark) {
    return generateLightTheme(baseColor, { baseTheme: theme });
  }
  return buildTheme({ ...theme, mode: 'light', displayMode: 'light', baseColor });
}

function getThemeById(id, customThemes) {
  if (THEME_MAP[id]) return THEME_MAP[id];
  const custom = (customThemes || []).find(t => t.id === id);
  return custom ? buildTheme(custom) : null;
}

function generatePaletteFromColors(mainColor, secondaryColor) {
  const main = Utilities.isValidHex(mainColor) ? mainColor : '#8B5CF6';
  const secondary = Utilities.isValidHex(secondaryColor) ? secondaryColor : Utilities.lighten(main, 0.3);
  return buildTheme({
    ...generateLightTheme(main, { baseTheme: { id: 'custom-generated', name: 'Custom', category: 'custom' } }),
    secondaryAccent: secondary,
    softAccent: Utilities.lighten(secondary, 0.35)
  });
}

/* ---------------- Semantic theme engine ---------------- */

const MEDIA_SELECTOR = [
  'img',
  'video',
  'canvas',
  'picture',
  'source',
  'svg',
  'iframe',
  'object',
  'embed',
  'ytd-thumbnail',
  'yt-img-shadow',
  '.html5-video-player',
  '[class*="thumbnail" i]',
  '[class*="avatar" i]',
  '[class*="profile" i]',
  '[class*="logo" i]',
  '[class*="ad-" i]',
  '[id*="ad-" i]',
  '[style*="background-image" i]'
].join(',');

const TEXT_TAGS = new Set([
  'A', 'ABBR', 'ADDRESS', 'B', 'BUTTON', 'CAPTION', 'CITE', 'CODE', 'DD',
  'DFN', 'DT', 'EM', 'FIGCAPTION', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
  'INPUT', 'LABEL', 'LEGEND', 'LI', 'OPTION', 'P', 'PRE', 'SAMP', 'SELECT',
  'SMALL', 'SPAN', 'STRONG', 'TD', 'TEXTAREA', 'TH', 'TIME'
]);

const YTMUSIC_READABLE_TEXT_VARS = {
  '--ytmusic-color-white1': 'text:primary',
  '--ytmusic-color-white2': 'text:primary',
  '--ytmusic-color-white3': 'text:secondary',
  '--ytmusic-color-white4': 'text:secondary',
  '--ytmusic-color-white5': 'text:muted',
  '--ytmusic-color-black1': 'text:primary',
  '--ytmusic-color-black2': 'text:primary',
  '--ytmusic-color-black3': 'text:secondary',
  '--ytmusic-color-black4': 'text:secondary',
  '--ytmusic-text-primary': 'text:primary',
  '--ytmusic-text-secondary': 'text:secondary',
  '--ytmusic-text-disabled': 'text:muted'
};

const GOOGLE_UNBOXED_SELECTORS = [
  '.g',
  '.MjjYud',
  '.kp-wholepage',
  '.kp-blk',
  '.wDYxhc',
  '.xpdopen',
  '.ULSxyf',
  '.cUnQKe',
  '.Wt5Tfe',
  '.related-question-pair',
  '.commercial-unit-desktop-top',
  '[data-attrid]'
].join(', ');

const GOOGLE_HEADER_SELECTORS = [
  '#gb',
  '#searchform',
  '.sfbg',
  '.appbar',
  '#top_nav',
  '#hdtb',
  '#slim_appbar',
  '#before-appbar',
  '.minidiv',
  '.Lj9fsd',
  '.yg51vc'
].join(', ');

const GOOGLE_SEARCHBOX_SELECTORS = [
  '.RNNXgb',
  'form[role="search"]',
  'textarea[name="q"]',
  'input[name="q"]'
].join(', ');

const YOUTUBE_UNBOXED_SELECTORS = [
  'ytd-rich-item-renderer',
  'ytd-video-renderer',
  'ytd-compact-video-renderer',
  'ytd-playlist-renderer',
  'ytd-channel-renderer',
  'ytd-rich-grid-media',
  'ytd-rich-grid-row',
  'ytd-item-section-renderer',
  'ytd-watch-next-secondary-results-renderer',
  'ytd-watch-metadata',
  '#contents.ytd-rich-grid-renderer',
  '#primary-inner',
  '#secondary-inner',
  'ytmusic-player-queue',
  'ytmusic-player-queue-item',
  'ytmusic-responsive-list-item-renderer',
  'ytmusic-shelf-renderer',
  'ytmusic-carousel-shelf-renderer'
].join(', ');

const YOUTUBE_LOGO_SELECTORS = [
  'ytd-topbar-logo-renderer',
  'ytd-logo',
  'a#logo',
  '#logo-icon',
  '#logo-icon-container'
].join(', ');

const YOUTUBE_MUSIC_LOGO_SELECTORS = [
  'ytmusic-logo',
  'ytmusic-nav-bar [id*="logo" i]',
  'ytmusic-nav-bar [class*="logo" i]'
].join(', ');

const YOUTUBE_CHIP_SELECTORS = [
  'ytd-chip-cloud-chip-renderer',
  'yt-chip-cloud-chip-renderer',
  '.ytChipShapeChip'
].join(', ');

const YOUTUBE_SELECTED_CHIP_SELECTORS = [
  'ytd-chip-cloud-chip-renderer[aria-selected="true"]',
  'yt-chip-cloud-chip-renderer[aria-selected="true"]',
  '.ytChipShapeChip[aria-selected="true"]',
  '.ytChipShapeChip[aria-pressed="true"]',
  '.ytChipShapeChip[selected]'
].join(', ');

const YOUTUBE_TOP_GRADIENT_SELECTORS = [
  'ytd-masthead',
  '#masthead-container',
  'ytd-mini-guide-renderer',
  'ytd-guide-renderer',
  '#guide-content',
  'tp-yt-app-drawer',
  'ytd-feed-filter-chip-bar-renderer',
  'ytd-chip-cloud-renderer',
  'yt-chip-cloud-renderer',
  '#chips-wrapper',
  '#chips',
  '#scroll-container.ytd-chip-cloud-renderer',
  '#contents.ytd-chip-cloud-renderer'
].join(', ');

const WEBSITE_ADAPTERS = [
  {
    id: 'generic',
    background: {
      deepest: ['html'],
      page: ['body', 'main', '[role="main"]', '#root', '#app', '#__next', '#__nuxt', '#page', '#content', '.page', '.main', '.content', '.site', '.layout', '.shell', '.app-shell', '.page-content', '.site-content', '.content-wrapper', '.main-content'],
      header: ['header', '[role="banner"]', '.header', '.site-header', '.topbar', '.navbar', '.masthead'],
      sidebar: ['aside', 'nav[aria-label*="side" i]', '.sidebar', '.sidenav', '.side-nav', '.drawer', '.rail'],
      card: ['article', '.card', '.panel', '.tile', '.result', '.item', '.post', '.entry', '.product', '.listing'],
      input: ['input:not([type="checkbox"]):not([type="radio"])', 'textarea', 'select', '[role="textbox"]', '[role="searchbox"]'],
      menu: ['dialog', '[role="dialog"]', '[role="menu"]', '[role="listbox"]', '[popover]', '.menu', '.dropdown', '.popover', '.modal'],
      selected: ['[aria-selected="true"]', '[aria-pressed="true"]', '.active', '.selected', '[selected]']
    },
    text: {
      primary: [
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'header',
        'header a',
        'header button',
        'header [role="button"]',
        'nav',
        'nav a',
        'nav button',
        'aside',
        'aside a',
        'aside button',
        '[role="navigation"]',
        '[role="navigation"] a',
        '[role="navigation"] button',
        '[role="tablist"]',
        '[role="tab"]',
        '.navbar',
        '.topbar',
        '.sidebar',
        '.sidenav',
        '.side-nav',
        '.drawer',
        '.rail'
      ],
      muted: ['small', 'time', 'figcaption', '.muted', '.meta', '.metadata', '.caption', '.subtitle'],
      link: ['a', '[role="link"]']
    },
    border: {
      border: ['header', 'nav', 'aside', 'article', '.card', '.panel', '.menu', '.dropdown', '.modal'],
      strong: ['[aria-selected="true"]', '[aria-pressed="true"]', '.active', '.selected']
    }
  },
  {
    id: 'youtube',
    background: {
      page: ['ytd-app', 'ytd-browse', 'ytd-page-manager', 'ytd-watch-flexy', '#page-manager', '#content.ytd-app'],
      header: ['ytd-masthead', '#masthead-container'],
      sidebar: ['ytd-guide-renderer', 'ytd-mini-guide-renderer', '#guide-content', 'tp-yt-app-drawer'],
      input: ['#container.ytd-searchbox', '#search-form', 'input#search'],
      menu: ['ytd-menu-popup-renderer', 'ytd-popup-container', 'tp-yt-paper-dialog', 'tp-yt-paper-listbox'],
      secondaryButton: ['ytd-chip-cloud-chip-renderer', 'yt-chip-cloud-chip-renderer', '.ytChipShapeChip'],
      selected: ['ytd-chip-cloud-chip-renderer[aria-selected="true"]', '.ytChipShapeChip[aria-selected="true"]', 'ytd-guide-entry-renderer[active]', 'ytd-mini-guide-entry-renderer[active]']
    },
    text: {
      primary: ['ytd-masthead', 'ytd-masthead a', 'ytd-masthead button', 'ytd-guide-renderer', 'ytd-guide-entry-renderer', 'ytd-mini-guide-entry-renderer', '#video-title', '#title', 'ytd-rich-grid-media #video-title', 'ytd-video-renderer #video-title'],
      muted: ['#metadata-line', '#channel-name', 'yt-formatted-string.ytd-video-meta-block'],
      link: ['a']
    },
    border: {
      border: ['ytd-masthead', '#container.ytd-searchbox', 'ytd-chip-cloud-chip-renderer', '.ytChipShapeChip'],
      strong: ['ytd-chip-cloud-chip-renderer[aria-selected="true"]', '.ytChipShapeChip[aria-selected="true"]']
    },
    variables: {
      'ytd-app': {
        '--yt-spec-base-background': 'page',
        '--yt-spec-raised-background': 'surface',
        '--yt-spec-menu-background': 'menu',
        '--yt-spec-general-background-a': 'page',
        '--yt-spec-general-background-b': 'secondary',
        '--yt-spec-general-background-c': 'surface',
        '--yt-spec-text-primary': 'primary',
        '--yt-spec-text-secondary': 'muted',
        '--yt-spec-text-disabled': 'muted',
        '--yt-spec-icon-active-other': 'text:primary',
        '--yt-spec-icon-inactive': 'text:primary',
        '--yt-spec-icon-disabled': 'text:muted',
        '--yt-spec-call-to-action': 'accent',
        '--yt-spec-brand-button-background': 'selected'
      }
    }
  },
  {
    id: 'youtube-music',
    background: {
      page: ['ytmusic-app', 'ytmusic-app-layout', 'ytmusic-player-page', '#layout'],
      header: ['ytmusic-nav-bar', '#nav-bar-background'],
      sidebar: ['ytmusic-guide-renderer', '#guide-wrapper', '#guide'],
      input: ['ytmusic-search-box', 'input#input'],
      menu: ['ytmusic-menu-popup-renderer', 'tp-yt-paper-listbox', 'tp-yt-paper-dialog'],
      secondaryButton: ['ytmusic-chip-cloud-chip-renderer', 'ytmusic-tab-renderer', '.tab'],
      selected: ['ytmusic-chip-cloud-chip-renderer[aria-selected="true"]', 'ytmusic-tab-renderer[selected]', '.tab[selected]', '[aria-selected="true"]']
    },
    text: {
      primary: [
        'ytmusic-nav-bar',
        'ytmusic-nav-bar a',
        'ytmusic-nav-bar button',
        'ytmusic-guide-renderer',
        'ytmusic-guide-entry-renderer',
        'ytmusic-player-queue #title',
        'ytmusic-player-queue .title',
        'ytmusic-player-queue yt-formatted-string',
        'ytmusic-player-queue-item #title',
        'ytmusic-responsive-list-item-renderer #title',
        'ytmusic-tabs yt-formatted-string',
        'ytmusic-tab-renderer'
      ],
      secondary: [
        'ytmusic-player-queue #byline',
        'ytmusic-player-queue .byline',
        'ytmusic-player-queue .subtitle',
        'ytmusic-responsive-list-item-renderer #subtitle'
      ],
      muted: [
        'ytmusic-player-queue .duration',
        'ytmusic-player-queue #duration',
        'ytmusic-player-queue .secondary-flex-columns',
        'ytmusic-responsive-list-item-renderer .secondary-flex-columns'
      ],
      link: ['ytmusic-player-queue a', 'ytmusic-app a']
    },
    border: {
      border: ['ytmusic-player-queue', 'ytmusic-player-queue-item', 'ytmusic-nav-bar', 'ytmusic-guide-renderer'],
      strong: ['ytmusic-tab-renderer[selected]', '[aria-selected="true"]']
    },
    variables: {
      'ytmusic-app': YTMUSIC_READABLE_TEXT_VARS,
      'ytmusic-app-layout': YTMUSIC_READABLE_TEXT_VARS,
      'ytmusic-nav-bar': YTMUSIC_READABLE_TEXT_VARS,
      'ytmusic-guide-renderer': YTMUSIC_READABLE_TEXT_VARS,
      'ytmusic-player-page': YTMUSIC_READABLE_TEXT_VARS,
      'ytmusic-player-queue': YTMUSIC_READABLE_TEXT_VARS,
      'ytmusic-tabs': YTMUSIC_READABLE_TEXT_VARS
    }
  },
  {
    id: 'chatgpt',
    background: {
      page: ['body', '#__next', 'main', '[role="main"]', '[class*="bg-token-main-surface-primary" i]', '[class*="bg-token-bg-primary" i]', '[class*="composer-parent" i]'],
      header: ['header', '[class*="sticky" i][class*="top" i]'],
      sidebar: ['aside', 'nav', '[data-testid="sidebar"]', '[class*="bg-token-sidebar-surface-primary" i]', '[class*="bg-token-sidebar-surface-secondary" i]'],
      surface: ['[class*="bg-token-main-surface-secondary" i]', '[class*="bg-token-main-surface-tertiary" i]'],
      card: ['[data-testid="conversation-turn"]', '[data-message-author-role]', '.markdown'],
      input: ['#prompt-textarea', 'textarea', '[contenteditable="true"]', '[data-testid="composer"]', '[class*="composer" i]'],
      menu: ['[role="dialog"]', '[role="menu"]', '[data-radix-popper-content-wrapper]'],
      selected: ['[aria-selected="true"]', '[aria-current="page"]', '[data-active="true"]', '[class*="bg-token-sidebar-surface-tertiary" i]']
    },
    text: {
      primary: ['header', 'aside', 'nav', 'header a', 'aside a', 'nav a', 'header button', 'aside button', 'nav button', 'h1', 'h2', 'h3', '[data-message-author-role]', '.markdown'],
      muted: ['small', '[class*="text-token-text-secondary" i]', '[class*="text-token-text-tertiary" i]'],
      link: ['a', '[role="link"]']
    },
    border: {
      border: ['header', 'aside', 'nav', '#prompt-textarea', '[data-testid="composer"]', '[role="dialog"]'],
      strong: ['[aria-selected="true"]', '[aria-current="page"]', '[data-active="true"]']
    },
    variables: {
      'body': {
        '--main-surface-primary': 'page',
        '--main-surface-secondary': 'surface',
        '--main-surface-tertiary': 'secondary',
        '--sidebar-surface-primary': 'sidebar',
        '--sidebar-surface-secondary': 'surface',
        '--sidebar-surface-tertiary': 'selected',
        '--text-primary': 'text:primary',
        '--text-secondary': 'text:secondary',
        '--text-tertiary': 'text:muted',
        '--border-light': 'border:border',
        '--border-medium': 'border:strong'
      }
    }
  },
  {
    id: 'google-search',
    background: {
      page: ['body', '#main', '#rcnt'],
      header: ['header', '#gb', '#searchform', '.sfbg', '.appbar'],
      input: ['textarea[name="q"]', 'input[name="q"]', '.RNNXgb'],
      menu: ['[role="menu"]', '[role="listbox"]'],
      selected: ['[aria-selected="true"]', '.hdtb-mitem.hdtb-msel']
    },
    text: {
      primary: ['h1', 'h2', 'h3', '.LC20lb', '.DKV0Md', '.yuRUbf', '.kp-wholepage [role="heading"]', '[data-attrid] span', '.wDYxhc span'],
      secondary: ['.hgKElc', '.kno-rdesc', '.wwUB2c', '.BNeawe', '.qLRx3b', '.bNg8Rb'],
      muted: ['.VwiC3b', '.IsZvec', '.MUxGbd', '.f', '.iUh30', '.tjvcx', '.NJjxre', '.OSrXXb', '.LEwnzc'],
      link: ['a', '.yuRUbf a']
    },
    border: {
      border: ['.RNNXgb', '.g', '.MjjYud', '.kp-wholepage']
    }
  },
  {
    id: 'amazon',
    background: {
      page: ['body', '#a-page', '#search'],
      header: ['#navbar', '#nav-main', '#nav-belt'],
      sidebar: ['#s-refinements', '#leftNav', '.a-section.a-spacing-none.aok-relative'],
      card: ['.s-result-item', '.a-cardui', '.sg-col-inner', '.a-box'],
      input: ['#twotabsearchtextbox', 'input[type="search"]', '.nav-input'],
      menu: ['.a-popover', '.a-dropdown-container', '[role="menu"]'],
      button: ['.a-button-primary', '#nav-search-submit-button'],
      secondaryButton: ['.a-button', '.a-button-secondary'],
      selected: ['.a-selected', '[aria-selected="true"]']
    },
    text: {
      primary: ['h1', 'h2', '.a-size-medium', '.a-size-base-plus'],
      muted: ['.a-color-secondary', '.a-size-small'],
      link: ['a', '.a-link-normal']
    },
    border: {
      border: ['.a-box', '.a-cardui', '.a-button', '.s-result-item'],
      strong: ['.a-button-primary']
    }
  },
  {
    id: 'wikipedia',
    background: {
      page: ['body', '#content', '.mw-body', '#mw-content-text'],
      header: ['.vector-header-container', '.mw-header', 'header'],
      sidebar: ['#mw-panel', '.vector-toc', '#vector-page-tools'],
      card: ['.infobox', '.sidebar', '.navbox', '.ambox', '.metadata'],
      input: ['#searchInput', 'input[type="search"]'],
      menu: ['.vector-menu-content', '[role="menu"]'],
      selected: ['.selected', '[aria-selected="true"]']
    },
    text: {
      primary: ['h1', 'h2', 'h3', '.mw-page-title-main'],
      muted: ['.mw-editsection', '.metadata', '.mw-parser-output .small'],
      link: ['a']
    },
    border: {
      border: ['.mw-body', '.infobox', '.navbox', '.ambox', '.vector-menu-content']
    }
  },
  {
    id: 'instagram',
    background: {
      page: ['body', 'main'],
      header: ['header'],
      sidebar: ['nav', 'aside'],
      card: ['article', '[role="presentation"]'],
      input: ['input', 'textarea', '[role="textbox"]'],
      menu: ['[role="dialog"]', '[role="menu"]'],
      selected: ['[aria-selected="true"]', '[aria-pressed="true"]']
    },
    text: {
      primary: ['h1', 'h2', 'span', 'time'],
      muted: ['time', '[class*="secondary" i]'],
      link: ['a']
    },
    border: {
      border: ['article', 'header', 'nav', '[role="dialog"]']
    }
  },
  {
    id: 'gmail',
    background: {
      page: ['body', '.nH', '.bkK', '.AO'],
      header: ['header', '.gb_2d', '.gb_Td', '.aUx'],
      sidebar: ['.aeN', '.TN', '.wT'],
      card: ['.aeF', '.Cp', '.UI', '.zA', '.Wg'],
      input: ['input', 'textarea', '[role="searchbox"]'],
      menu: ['.J-M', '.b8', '[role="menu"]', '[role="dialog"]'],
      selected: ['.ain', '.TO.NQ', '[aria-selected="true"]']
    },
    text: {
      primary: ['.bog', '.y6', '.ha', 'h1', 'h2'],
      muted: ['.y2', '.g3', '.gD', '.xY'],
      link: ['a']
    },
    border: {
      border: ['.zA', '.J-M', '.b8', '.aeN']
    }
  }
];

const BACKGROUND_ROLE_VARS = {
  deepest: '--lcbc-deepest-bg',
  page: '--lcbc-page-bg',
  secondary: '--lcbc-secondary-bg',
  header: '--lcbc-header-bg',
  sidebar: '--lcbc-sidebar-bg',
  surface: '--lcbc-surface',
  elevated: '--lcbc-elevated-surface',
  card: '--lcbc-card-bg',
  input: '--lcbc-input-bg',
  menu: '--lcbc-menu-bg',
  button: '--lcbc-button-bg',
  secondaryButton: '--lcbc-secondary-button-bg',
  selected: '--lcbc-selected-bg',
  hover: '--lcbc-hover-bg'
};

const TEXT_ROLE_VARS = {
  primary: '--lcbc-primary-text',
  secondary: '--lcbc-secondary-text',
  muted: '--lcbc-muted-text',
  inverse: '--lcbc-inverse-text',
  link: '--lcbc-link',
  input: '--lcbc-input-text',
  button: '--lcbc-button-text',
  secondaryButton: '--lcbc-secondary-button-text',
  selected: '--lcbc-selected-text',
  success: '--lcbc-success',
  warning: '--lcbc-warning',
  error: '--lcbc-error'
};

const BORDER_ROLE_VARS = {
  border: '--lcbc-border',
  subtle: '--lcbc-subtle-border',
  strong: '--lcbc-strong-border',
  accent: '--lcbc-strong-accent'
};

const BACKGROUND_ROLE_GRADIENTS = {
  deepest: '--lcbc-screen-gradient',
  page: '--lcbc-screen-gradient',
  secondary: '--lcbc-surface-gradient',
  header: '--lcbc-header-gradient',
  sidebar: '--lcbc-sidebar-gradient',
  surface: '--lcbc-surface-gradient',
  elevated: '--lcbc-menu-gradient',
  card: '--lcbc-card-gradient',
  input: '--lcbc-input-gradient',
  menu: '--lcbc-menu-gradient',
  button: '--lcbc-button-gradient',
  secondaryButton: '--lcbc-surface-gradient',
  selected: '--lcbc-selected-gradient',
  hover: '--lcbc-surface-gradient'
};

const originalInlineStyles = new WeakMap();
const modifiedElements = new Set();
const originalAttributes = new WeakMap();
const attributedElements = new Set();
let themeObserver = null;
let scheduledApply = null;
let activeTheme = null;
let activeOptions = null;

function parseCssColor(value) {
  if (!value || value === 'transparent' || value === 'currentColor') return null;
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) return null;
  const parts = match[1].split(',').map(part => part.trim());
  if (parts.length < 3) return null;
  const r = Number.parseFloat(parts[0]);
  const g = Number.parseFloat(parts[1]);
  const b = Number.parseFloat(parts[2]);
  const a = parts[3] === undefined ? 1 : Number.parseFloat(parts[3]);
  if ([r, g, b, a].some(Number.isNaN)) return null;
  return { r, g, b, a };
}

function colorToHex(color) {
  if (!color) return '#000000';
  return Utilities.rgbToHex(color.r, color.g, color.b);
}

function colorLuminance(color) {
  if (!color) return 1;
  return Utilities.relativeLuminance(colorToHex(color));
}

function getReadableTextColor(backgroundColor, lightText = '#FFFFFF', darkText = '#111827') {
  const lightRatio = Utilities.contrastRatio(backgroundColor, lightText);
  const darkRatio = Utilities.contrastRatio(backgroundColor, darkText);
  return lightRatio >= darkRatio ? lightText : darkText;
}

function ensureContrast(textColor, backgroundColor, minimumRatio = 4.5) {
  let color = textColor;
  let attempts = 0;
  while (Utilities.contrastRatio(color, backgroundColor) < minimumRatio && attempts < 16) {
    const textLum = Utilities.relativeLuminance(color);
    const bgLum = Utilities.relativeLuminance(backgroundColor);
    color = textLum > bgLum ? Utilities.lighten(color, 0.08) : Utilities.darken(color, 0.08);
    attempts += 1;
  }
  return color;
}

function ensureTextContrast(textColor, backgroundColor, minimumRatio) {
  return ensureContrast(textColor, backgroundColor, minimumRatio);
}

function resolveReadableText(backgroundColor, preferredText, minimumRatio = 4.5) {
  if (preferredText && Utilities.contrastRatio(preferredText, backgroundColor) >= minimumRatio) {
    return preferredText;
  }
  return getReadableTextColor(backgroundColor, '#FFFFFF', '#000000');
}

function isSolidColor(color) {
  return !!color && color.a > 0.08;
}

function hasBackgroundImage(style) {
  return style.backgroundImage && style.backgroundImage !== 'none';
}

function hasVisibleBorder(style) {
  return ['Top', 'Right', 'Bottom', 'Left'].some(side => {
    const width = Number.parseFloat(style[`border${side}Width`]);
    const color = parseCssColor(style[`border${side}Color`]);
    return width > 0 && isSolidColor(color);
  });
}

function adjustThemeForOptions(theme, options) {
  const opts = options || {};
  const bgBrightness = Utilities.clamp(opts.backgroundBrightness ?? 100, 40, 140) / 100;
  const textContrast = Utilities.clamp(opts.textContrast ?? 100, 70, 150) / 100;

  const adjustBrightness = (hex, factor) => {
    if (factor === 1) return hex;
    if (factor > 1) return Utilities.lighten(hex, Math.min(0.7, factor - 1));
    return Utilities.darken(hex, Math.min(0.7, 1 - factor));
  };

  const adjustText = (hex, backgroundHex, minimumRatio) => {
    if (textContrast === 1 && bgBrightness === 1) return hex;
    let text = hex;
    if (textContrast > 1) {
      text = theme.isDark
        ? Utilities.lighten(text, Math.min(0.35, (textContrast - 1) * 0.35))
        : Utilities.darken(text, Math.min(0.35, (textContrast - 1) * 0.35));
    }
    return ensureTextContrast(text, backgroundHex, minimumRatio);
  };

  const background = adjustBrightness(theme.background, bgBrightness);
  const deepestBackground = adjustBrightness(theme.deepestBackground, bgBrightness);
  const secondaryBackground = adjustBrightness(theme.secondaryBackground, bgBrightness);
  const headerBackground = adjustBrightness(theme.headerBackground, bgBrightness);
  const sidebarBackground = adjustBrightness(theme.sidebarBackground, bgBrightness);
  const surface = adjustBrightness(theme.surface, bgBrightness);
  const elevatedSurface = adjustBrightness(theme.elevatedSurface, bgBrightness);
  const cardBackground = adjustBrightness(theme.cardBackground, bgBrightness);
  const inputBackground = adjustBrightness(theme.inputBackground, bgBrightness);
  const menuBackground = adjustBrightness(theme.menuBackground, bgBrightness);
  const subtleAccentSurface = adjustBrightness(theme.subtleAccentSurface, bgBrightness);
  const selectedBackground = adjustBrightness(theme.selectedBackground, bgBrightness);
  const hoverBackground = adjustBrightness(theme.hoverBackground, bgBrightness);
  const secondaryButtonBackground = adjustBrightness(theme.secondaryButtonBackground, bgBrightness);

  return buildTheme({
    ...theme,
    pageBackground: background,
    background,
    deepestBackground,
    secondaryBackground,
    headerBackground,
    sidebarBackground,
    surface,
    elevatedSurface,
    cardBackground,
    inputBackground,
    menuBackground,
    subtleAccentSurface,
    selectedBackground,
    hoverBackground,
    secondaryButtonBackground,
    primaryText: adjustText(theme.primaryText, surface, 7),
    secondaryText: adjustText(theme.secondaryText, surface, 4.5),
    mutedText: adjustText(theme.mutedText, surface, 4.5),
    inputText: adjustText(theme.inputText, inputBackground, 7),
    buttonText: textContrast === 1 && bgBrightness === 1
      ? theme.buttonText
      : ensureTextContrast(theme.buttonText, theme.buttonBackground, 4.5),
    secondaryButtonText: textContrast === 1 && bgBrightness === 1
      ? theme.secondaryButtonText
      : ensureTextContrast(theme.secondaryButtonText, secondaryButtonBackground, 4.5),
    selectedText: textContrast === 1 && bgBrightness === 1
      ? theme.selectedText
      : ensureTextContrast(theme.selectedText, selectedBackground, 4.5)
  });
}

function blendFromOriginal(originalColor, targetHex, options) {
  const intensity = Utilities.clamp(options?.themeIntensity ?? 100, 0, 100) / 100;
  if (!originalColor || intensity >= 0.995) return targetHex;
  return Utilities.mixColors(colorToHex(originalColor), targetHex, intensity);
}

function rememberInlineStyle(el, property) {
  let record = originalInlineStyles.get(el);
  if (!record) {
    record = {};
    originalInlineStyles.set(el, record);
    modifiedElements.add(el);
  }
  if (!record[property]) {
    record[property] = {
      value: el.style.getPropertyValue(property),
      priority: el.style.getPropertyPriority(property)
    };
  }
}

function setInlineStyle(el, property, value) {
  rememberInlineStyle(el, property);
  el.style.setProperty(property, value, 'important');
}

function restoreInlineStyles() {
  modifiedElements.forEach(el => {
    const record = originalInlineStyles.get(el);
    if (!record) return;
    Object.entries(record).forEach(([property, original]) => {
      if (original.value) {
        el.style.setProperty(property, original.value, original.priority);
      } else {
        el.style.removeProperty(property);
      }
    });
  });
  modifiedElements.clear();
}

function rememberAttribute(el, attribute) {
  let record = originalAttributes.get(el);
  if (!record) {
    record = {};
    originalAttributes.set(el, record);
    attributedElements.add(el);
  }
  if (!(attribute in record)) {
    record[attribute] = el.hasAttribute(attribute) ? el.getAttribute(attribute) : null;
  }
}

function setThemeAttribute(el, attribute, value = '') {
  rememberAttribute(el, attribute);
  el.setAttribute(attribute, value);
}

function restoreThemeAttributes() {
  attributedElements.forEach(el => {
    const record = originalAttributes.get(el);
    if (!record) return;
    Object.entries(record).forEach(([attribute, value]) => {
      if (value === null) el.removeAttribute(attribute);
      else el.setAttribute(attribute, value);
    });
  });
  attributedElements.clear();
}

function lowerIdentity(el) {
  return `${el.tagName || ''} ${el.id || ''} ${el.className || ''} ${el.getAttribute?.('role') || ''}`.toLowerCase();
}

function isHidden(style) {
  return style.display === 'none' || style.visibility === 'hidden' || Number.parseFloat(style.opacity || '1') <= 0.02;
}

function isMediaElement(el) {
  const tag = el.tagName;
  return ['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'SOURCE', 'SVG', 'IFRAME', 'OBJECT', 'EMBED'].includes(tag);
}

function isProtectedMediaContext(el, style) {
  if (isMediaElement(el)) return true;
  if (hasBackgroundImage(style) && !el.hasAttribute('data-lcbc-bg-role')) return true;
  return !!el.closest(MEDIA_SELECTOR) ||
    !!el.closest('.html5-video-player, ytd-player, #movie_player, [class*="video-player" i], [class*="media-player" i], [class*="ytp-" i]');
}

function hasDirectText(el) {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim().length > 0) return true;
  }
  return false;
}

function isPageRegion(el) {
  if (el === document.documentElement || el === document.body) return true;
  const id = lowerIdentity(el);
  return el.matches('main, [role="main"], ytd-app, ytd-browse, ytd-page-manager, #page-manager') ||
    /\b(app|root|page|main|content|layout|shell)\b/.test(id);
}

function isHeaderRegion(el) {
  const id = lowerIdentity(el);
  return el.matches('header, [role="banner"]') ||
    /\b(header|masthead|topbar|navbar|nav-bar|appbar|toolbar)\b/.test(id);
}

function isSidebarRegion(el) {
  const id = lowerIdentity(el);
  return el.matches('aside, nav, [role="navigation"], [aria-label*="side" i]') ||
    /\b(sidebar|sidenav|side-nav|drawer|rail|guide|leftnav|left-nav|toc)\b/.test(id);
}

function isMenuRegion(el) {
  const id = lowerIdentity(el);
  return el.matches('menu, [role="menu"], [role="listbox"], [role="dialog"], [popover]') ||
    /\b(menu|popover|modal|dialog|dropdown|tooltip|toast|floating|sheet)\b/.test(id);
}

function isCardRegion(el) {
  const id = lowerIdentity(el);
  return el.matches('article, section, [role="article"], [role="feed"] > *') ||
    /\b(card|panel|pane|box|tile|result|item|post|entry|story|product|listing|infobox)\b/.test(id);
}

function isSurface(el) {
  const id = lowerIdentity(el);
  return el.matches('header, nav, aside, section, article, dialog, menu, [role="navigation"], [role="dialog"], [role="menu"], [role="listbox"]') ||
    /\b(card|panel|pane|box|drawer|sidebar|menu|popover|modal|dialog|dropdown|sheet|toolbar|masthead|guide|rail|shelf|result|item)\b/.test(id);
}

function isElevatedSurface(el) {
  const id = lowerIdentity(el);
  return el.matches('dialog, [role="dialog"], [role="menu"], [role="tooltip"], [popover]') ||
    /\b(popover|tooltip|modal|dialog|dropdown|menu|toast|floating|overlay)\b/.test(id);
}

function isFormControl(el) {
  return el.matches('input, textarea, select, [contenteditable="true"], [role="textbox"], [role="searchbox"]');
}

function isButtonLike(el) {
  const id = lowerIdentity(el);
  return el.matches('button, input[type="button"], input[type="submit"], input[type="reset"], [role="button"], [role="tab"], [role="switch"], [aria-pressed], [aria-selected]') ||
    /\b(button|btn|chip|pill|tab|filter|toggle|cta|primary)\b/.test(id);
}

function isSecondaryControl(el) {
  const id = lowerIdentity(el);
  return /\b(secondary|ghost|outline|chip|pill|filter|tab)\b/.test(id);
}

function isActiveControl(el) {
  const ariaPressed = el.getAttribute('aria-pressed');
  const ariaSelected = el.getAttribute('aria-selected');
  const id = lowerIdentity(el);
  return ariaPressed === 'true' || ariaSelected === 'true' ||
    el.matches('[selected], [checked], .active, .selected, [active]') ||
    /\b(active|selected|current|checked)\b/.test(id);
}

function isMutedTextElement(el) {
  const id = lowerIdentity(el);
  return el.matches('small, time, figcaption') ||
    /\b(meta|metadata|secondary|muted|subtext|subtitle|caption|description|desc|time|date|byline|views|count)\b/.test(id);
}

function isStatusElement(el) {
  const id = lowerIdentity(el);
  if (/\b(error|danger|invalid|alert)\b/.test(id)) return 'error';
  if (/\b(warn|warning|caution)\b/.test(id)) return 'warning';
  if (/\b(success|valid|complete|done)\b/.test(id)) return 'success';
  return null;
}

function backgroundRoleForElement(el, style) {
  if (el === document.documentElement) return 'deepest';
  if (el === document.body) return 'page';
  if (isMenuRegion(el)) return isElevatedSurface(el) ? 'elevated' : 'menu';
  if (isFormControl(el)) return 'input';
  if (isButtonLike(el)) {
    if (isActiveControl(el)) return 'selected';
    return isSecondaryControl(el) ? 'secondaryButton' : 'button';
  }
  if (el.matches('a')) return null;
  if (isHeaderRegion(el)) return 'header';
  if (isSidebarRegion(el)) return 'sidebar';
  if (isPageRegion(el)) return 'page';
  if (isCardRegion(el)) return 'card';
  if (isElevatedSurface(el)) return 'elevated';
  if (isSurface(el)) return 'surface';

  const bg = parseCssColor(style.backgroundColor);
  if (!isSolidColor(bg)) return null;
  const lum = colorLuminance(bg);
  if (lum > 0.9) return 'card';
  if (lum > 0.72) return 'secondary';
  if (lum < 0.18) return 'card';
  return 'secondary';
}

function textRoleForElement(el, style) {
  const status = isStatusElement(el);
  if (status) return status;
  if (el.matches('a, [role="link"]')) return 'link';
  if (isButtonLike(el) && isActiveControl(el)) return 'selected';
  if (isButtonLike(el)) return isSecondaryControl(el) ? 'secondaryButton' : 'button';
  if (isFormControl(el)) return 'input';
  if (isMutedTextElement(el)) return 'muted';

  const color = parseCssColor(style.color);
  if (!isSolidColor(color)) return 'primary';
  const lum = colorLuminance(color);
  if (lum > 0.42 && lum < 0.74) return 'muted';
  return 'primary';
}

function themeBackgroundForRole(theme, role) {
  const map = {
    deepest: theme.deepestBackground,
    page: theme.pageBackground,
    secondary: theme.secondaryBackground,
    header: theme.headerBackground,
    sidebar: theme.sidebarBackground,
    surface: theme.surface,
    elevated: theme.elevatedSurface,
    card: theme.cardBackground,
    input: theme.inputBackground,
    menu: theme.menuBackground,
    button: theme.buttonBackground,
    secondaryButton: theme.secondaryButtonBackground,
    selected: theme.selectedBackground,
    hover: theme.hoverBackground
  };
  return map[role] || theme.surface;
}

function themeTextForRole(theme, role) {
  const map = {
    primary: theme.primaryText,
    secondary: theme.secondaryText,
    muted: theme.mutedText,
    inverse: theme.inverseText,
    link: theme.link,
    input: theme.inputText,
    button: theme.buttonText,
    secondaryButton: theme.secondaryButtonText,
    selected: theme.selectedText,
    success: theme.success,
    warning: theme.warning,
    error: theme.error
  };
  return map[role] || theme.primaryText;
}

function themeBorderForRole(theme, role) {
  const map = {
    border: theme.border,
    subtle: theme.subtleBorder,
    strong: theme.strongBorder,
    accent: theme.strongAccent
  };
  return map[role] || theme.border;
}

function shouldApplyText(el) {
  return TEXT_TAGS.has(el.tagName) || hasDirectText(el) || el.matches('[role="link"], [role="button"], [role="tab"]');
}

function applyBorder(el, style, theme, options) {
  if (!hasVisibleBorder(style) && !isFormControl(el) && !isButtonLike(el)) return;
  const role = isActiveControl(el) ? 'strong' : 'border';
  setThemeAttribute(el, 'data-lcbc-border-role', role);

  const intensity = Utilities.clamp(options?.themeIntensity ?? 100, 0, 100) / 100;
  if (intensity < 0.995) {
    const target = themeBorderForRole(theme, role);
    setInlineStyle(el, '--lcbc-local-border', blendFromOriginal(parseCssColor(style.borderTopColor), target, options));
  }
}

function applySemanticElement(el, theme, options) {
  if (!(el instanceof Element) || el.id === THEME_STYLE_ID) return;
  const style = getComputedStyle(el);
  if (isHidden(style)) return;

  const protectedMedia = isProtectedMediaContext(el, style);
  if (protectedMedia) {
    if (isMediaElement(el) || (hasBackgroundImage(style) && !el.hasAttribute('data-lcbc-bg-role'))) {
      setInlineStyle(el, 'filter', 'none');
      setInlineStyle(el, 'opacity', '1');
      setInlineStyle(el, 'mix-blend-mode', 'normal');
    }
    return;
  }

  const bg = parseCssColor(style.backgroundColor);
  const hasSolidBg = isSolidColor(bg);
  const backgroundRole = el.getAttribute('data-lcbc-bg-role') || backgroundRoleForElement(el, style);
  const hasMediaChildren = !!el.querySelector?.('img, video, canvas, picture, svg, ytd-thumbnail, yt-img-shadow');
  const intensity = Utilities.clamp(options?.themeIntensity ?? 100, 0, 100) / 100;

  if (backgroundRole && !hasBackgroundImage(style) && (hasSolidBg || isPageRegion(el) || isFormControl(el) || isButtonLike(el))) {
    if (!(hasMediaChildren && !hasSolidBg && !isPageRegion(el))) {
      setThemeAttribute(el, 'data-lcbc-bg-role', backgroundRole);
      if (intensity < 0.995) {
        const target = themeBackgroundForRole(theme, backgroundRole);
        setInlineStyle(el, '--lcbc-local-bg', blendFromOriginal(bg, target, options));
      }
    }
  }

  if (shouldApplyText(el)) {
    const textRole = el.getAttribute('data-lcbc-text-role') || textRoleForElement(el, style);
    setThemeAttribute(el, 'data-lcbc-text-role', textRole);
    if (intensity < 0.995) {
      const target = themeTextForRole(theme, textRole);
      setInlineStyle(el, '--lcbc-local-text', blendFromOriginal(parseCssColor(style.color), target, options));
    }
  }

  applyBorder(el, style, theme, options);

  if (isFormControl(el) || isButtonLike(el)) {
    setThemeAttribute(el, 'data-lcbc-control', '');
  }
}

function safeQueryAll(selector) {
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch (e) {
    return [];
  }
}

function uniqueElementsForSelectors(selectors) {
  const elements = new Set();
  selectors.forEach(selector => {
    safeQueryAll(selector).forEach(el => elements.add(el));
  });
  return elements;
}

function setMappedRole(el, kind, role, theme, options) {
  if (!(el instanceof Element) || el.id === THEME_STYLE_ID) return;
  const style = getComputedStyle(el);
  if (isHidden(style) || isProtectedMediaContext(el, style)) return;

  const intensity = Utilities.clamp(options?.themeIntensity ?? 100, 0, 100) / 100;
  if (kind === 'background') {
    if (hasBackgroundImage(style)) return;
    setThemeAttribute(el, 'data-lcbc-bg-role', role);
    if (intensity < 0.995) {
      setInlineStyle(el, '--lcbc-local-bg', blendFromOriginal(parseCssColor(style.backgroundColor), themeBackgroundForRole(theme, role), options));
    }
  } else if (kind === 'text') {
    setThemeAttribute(el, 'data-lcbc-text-role', role);
    if (intensity < 0.995) {
      setInlineStyle(el, '--lcbc-local-text', blendFromOriginal(parseCssColor(style.color), themeTextForRole(theme, role), options));
    }
  } else if (kind === 'border') {
    setThemeAttribute(el, 'data-lcbc-border-role', role);
    if (intensity < 0.995) {
      setInlineStyle(el, '--lcbc-local-border', blendFromOriginal(parseCssColor(style.borderTopColor), themeBorderForRole(theme, role), options));
    }
  }
}

function applyWebsiteAdapters(theme, options) {
  WEBSITE_ADAPTERS.forEach(adapter => {
    Object.entries(adapter.background || {}).forEach(([role, selectors]) => {
      uniqueElementsForSelectors(selectors).forEach(el => setMappedRole(el, 'background', role, theme, options));
    });
    Object.entries(adapter.text || {}).forEach(([role, selectors]) => {
      uniqueElementsForSelectors(selectors).forEach(el => setMappedRole(el, 'text', role, theme, options));
    });
    Object.entries(adapter.border || {}).forEach(([role, selectors]) => {
      uniqueElementsForSelectors(selectors).forEach(el => setMappedRole(el, 'border', role, theme, options));
    });
  });
}

function applySemanticTheme(theme, options) {
  const themed = adjustThemeForOptions(resolveThemeForDisplayMode(theme, options), options);
  applyWebsiteAdapters(themed, options);
  const roots = [document.documentElement, document.body].filter(Boolean);
  roots.forEach(el => applySemanticElement(el, themed, options));

  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT);
  let count = 0;
  while (walker.nextNode() && count < 6000) {
    count += 1;
    applySemanticElement(walker.currentNode, themed, options);
  }
}

function selectorList(selectors) {
  return selectors.map(selector => {
    const trimmed = selector.trim();
    return trimmed === 'html' || trimmed === ':root'
      ? `:root[${THEME_ATTR}]:not([style*="background-image" i])`
      : `:root[${THEME_ATTR}] :where(${selector}):not([style*="background-image" i])`;
  }).join(',\n');
}

function buildRoleCssRules(adapter) {
  const rules = [];
  Object.entries(adapter.background || {}).forEach(([role, selectors]) => {
    const cssVar = BACKGROUND_ROLE_VARS[role];
    const gradientVar = BACKGROUND_ROLE_GRADIENTS[role];
    if (!cssVar || !selectors.length) return;
    const gradientLines = gradientVar
      ? `\n  background-image: var(${gradientVar}) !important;${role === 'deepest' || role === 'page' ? '\n  background-attachment: fixed !important;\n  background-size: cover !important;' : ''}`
      : '';
    rules.push(`${selectorList(selectors)} {\n  background-color: var(${cssVar}) !important;${gradientLines}\n}`);
  });
  Object.entries(adapter.text || {}).forEach(([role, selectors]) => {
    const cssVar = TEXT_ROLE_VARS[role];
    if (!cssVar || !selectors.length) return;
    rules.push(`${selectorList(selectors)} {\n  color: var(${cssVar}) !important;\n}`);
  });
  Object.entries(adapter.border || {}).forEach(([role, selectors]) => {
    const cssVar = BORDER_ROLE_VARS[role];
    if (!cssVar || !selectors.length) return;
    rules.push(`${selectorList(selectors)} {\n  border-color: var(${cssVar}) !important;\n}`);
  });
  Object.entries(adapter.variables || {}).forEach(([selector, variables]) => {
    const declarations = Object.entries(variables).map(([name, role]) => {
      const cssVar = variableForRole(role);
      return `  ${name}: var(${cssVar}) !important;`;
    }).join('\n');
    rules.push(`:root[${THEME_ATTR}] ${selector} {\n${declarations}\n}`);
  });
  return rules.join('\n\n');
}

function variableForRole(role) {
  if (typeof role !== 'string') return '--lcbc-primary-text';
  if (role.startsWith('bg:')) return BACKGROUND_ROLE_VARS[role.slice(3)] || '--lcbc-surface';
  if (role.startsWith('text:')) return TEXT_ROLE_VARS[role.slice(5)] || '--lcbc-primary-text';
  if (role.startsWith('border:')) return BORDER_ROLE_VARS[role.slice(7)] || '--lcbc-border';
  return BACKGROUND_ROLE_VARS[role] || TEXT_ROLE_VARS[role] || BORDER_ROLE_VARS[role] || `--lcbc-${role}`;
}

function buildWebsiteAdapterCss() {
  return WEBSITE_ADAPTERS.map(buildRoleCssRules).filter(Boolean).join('\n\n');
}

function buildThemeCss(theme, options) {
  const t = adjustThemeForOptions(resolveThemeForDisplayMode(theme, options), options);
  return `
:root[${THEME_ATTR}] {
  color-scheme: ${t.isDark ? 'dark' : 'light'};
  --lcbc-black-base: ${t.blackBase};
  --lcbc-deepest-bg: ${t.deepestBackground};
  --lcbc-very-dark: ${t.veryDark};
  --lcbc-dark: ${t.dark};
  --lcbc-moderately-dark: ${t.moderatelyDark};
  --lcbc-mid-tone: ${t.midTone};
  --lcbc-moderately-light: ${t.moderatelyLight};
  --lcbc-light: ${t.light};
  --lcbc-very-light: ${t.veryLight};
  --lcbc-page-bg: ${t.pageBackground};
  --lcbc-secondary-bg: ${t.secondaryBackground};
  --lcbc-header-bg: ${t.headerBackground};
  --lcbc-sidebar-bg: ${t.sidebarBackground};
  --lcbc-surface: ${t.surface};
  --lcbc-elevated-surface: ${t.elevatedSurface};
  --lcbc-card-bg: ${t.cardBackground};
  --lcbc-input-bg: ${t.inputBackground};
  --lcbc-menu-bg: ${t.menuBackground};
  --lcbc-subtle-accent-surface: ${t.subtleAccentSurface};
  --lcbc-primary-text: ${t.primaryText};
  --lcbc-secondary-text: ${t.secondaryText};
  --lcbc-muted-text: ${t.mutedText};
  --lcbc-inverse-text: ${t.inverseText};
  --lcbc-accent: ${t.accent};
  --lcbc-strong-accent: ${t.strongAccent};
  --lcbc-bright-accent: ${t.brightAccent};
  --lcbc-soft-accent: ${t.softAccent};
  --lcbc-selected-bg: ${t.selectedBackground};
  --lcbc-selected-text: ${t.selectedText};
  --lcbc-hover-bg: ${t.hoverBackground};
  --lcbc-border: ${t.border};
  --lcbc-strong-border: ${t.strongBorder};
  --lcbc-subtle-border: ${t.subtleBorder};
  --lcbc-input-text: ${t.inputText};
  --lcbc-button-bg: ${t.buttonBackground};
  --lcbc-button-text: ${t.buttonText};
  --lcbc-secondary-button-bg: ${t.secondaryButtonBackground};
  --lcbc-secondary-button-text: ${t.secondaryButtonText};
  --lcbc-link: ${t.link};
  --lcbc-link-hover: ${t.linkHover};
  --lcbc-success: ${t.success};
  --lcbc-warning: ${t.warning};
  --lcbc-error: ${t.error};
  --lcbc-glow: ${t.glow};
  --lcbc-screen-gradient: ${t.screenGradient};
  --lcbc-header-gradient: ${t.headerGradient};
  --lcbc-sidebar-gradient: ${t.sidebarGradient};
  --lcbc-surface-gradient: ${t.surfaceGradient};
  --lcbc-card-gradient: ${t.cardGradient};
  --lcbc-menu-gradient: ${t.menuGradient};
  --lcbc-input-gradient: ${t.inputGradient};
  --lcbc-selected-gradient: ${t.selectedGradient};
  --lcbc-button-gradient: ${t.buttonGradient};
  --lcbc-shadow: ${t.shadow};
}

:root[${THEME_ATTR}] ::selection {
  background: var(--lcbc-selected-bg);
  color: var(--lcbc-primary-text);
}

:root[${THEME_ATTR}] [data-lcbc-bg-role="deepest"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-deepest-bg)) !important;
  background-image: var(--lcbc-screen-gradient) !important;
  background-attachment: fixed !important;
  background-size: cover !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="page"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-page-bg)) !important;
  background-image: var(--lcbc-screen-gradient) !important;
  background-attachment: fixed !important;
  background-size: cover !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="secondary"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-secondary-bg)) !important;
  background-image: var(--lcbc-surface-gradient) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="header"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-header-bg)) !important;
  background-image: var(--lcbc-header-gradient) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="sidebar"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-sidebar-bg)) !important;
  background-image: var(--lcbc-sidebar-gradient) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="surface"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-surface)) !important;
  background-image: var(--lcbc-surface-gradient) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="elevated"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-elevated-surface)) !important;
  background-image: var(--lcbc-menu-gradient) !important;
  box-shadow: 0 8px 28px var(--lcbc-shadow) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="card"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-card-bg)) !important;
  background-image: var(--lcbc-card-gradient) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="input"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-input-bg)) !important;
  background-image: var(--lcbc-input-gradient) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="menu"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-menu-bg)) !important;
  background-image: var(--lcbc-menu-gradient) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="button"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-button-bg)) !important;
  background-image: var(--lcbc-button-gradient) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="secondaryButton"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-secondary-button-bg)) !important;
  background-image: var(--lcbc-surface-gradient) !important;
}
:root[${THEME_ATTR}] [data-lcbc-bg-role="selected"] {
  background-color: var(--lcbc-local-bg, var(--lcbc-selected-bg)) !important;
  background-image: var(--lcbc-selected-gradient) !important;
}

:root[${THEME_ATTR}] :where(${GOOGLE_UNBOXED_SELECTORS}) {
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_UNBOXED_SELECTORS}) {
  background-color: transparent !important;
  background-image: none !important;
  box-shadow: none !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_TOP_GRADIENT_SELECTORS}) {
  background-color: transparent !important;
  background-image: var(--lcbc-screen-gradient) !important;
  background-attachment: fixed !important;
  background-size: cover !important;
  color: var(--lcbc-primary-text) !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_TOP_GRADIENT_SELECTORS}) :where(a, button, [role="button"], [aria-label]:not(input):not(textarea), span, yt-formatted-string, tp-yt-paper-item) {
  color: inherit !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_TOP_GRADIENT_SELECTORS}) :where(yt-icon, tp-yt-iron-icon, iron-icon, svg:not([class*="logo" i]):not([id*="logo" i]), svg:not([class*="logo" i]):not([id*="logo" i]) *, path, circle, rect, line, polyline, polygon) {
  color: var(--lcbc-primary-text) !important;
  fill: currentColor !important;
  stroke: currentColor !important;
  opacity: 1 !important;
}

:root[${THEME_ATTR}] :where(${GOOGLE_HEADER_SELECTORS}) {
  background-color: transparent !important;
  background-image: var(--lcbc-screen-gradient) !important;
  background-attachment: fixed !important;
  background-size: cover !important;
  color: var(--lcbc-primary-text) !important;
}

:root[${THEME_ATTR}] :where(${GOOGLE_SEARCHBOX_SELECTORS}) {
  background-color: var(--lcbc-input-bg) !important;
  background-image: var(--lcbc-input-gradient) !important;
  color: var(--lcbc-input-text) !important;
  border-color: var(--lcbc-border) !important;
  box-shadow: 0 0 0 1px var(--lcbc-border), 0 10px 28px var(--lcbc-shadow) !important;
}

:root[${THEME_ATTR}] :where(${GOOGLE_HEADER_SELECTORS}, ${GOOGLE_SEARCHBOX_SELECTORS}) :where(a, button, [role="button"], [aria-label]:not(input):not(textarea), span, div) {
  color: inherit !important;
}

:root[${THEME_ATTR}] :where(${GOOGLE_HEADER_SELECTORS}, ${GOOGLE_SEARCHBOX_SELECTORS}) :where(svg:not([class*="logo" i]):not([id*="logo" i]), svg:not([class*="logo" i]):not([id*="logo" i]) *, path, circle, rect, line, polyline, polygon) {
  color: var(--lcbc-primary-text) !important;
  fill: currentColor !important;
  stroke: currentColor !important;
  opacity: 1 !important;
}

:root[${THEME_ATTR}] :where(${GOOGLE_SEARCHBOX_SELECTORS}) :where(input, textarea) {
  background: transparent !important;
  color: var(--lcbc-input-text) !important;
  caret-color: var(--lcbc-accent) !important;
}

:root[${THEME_ATTR}] [data-lcbc-text-role="primary"] {
  color: var(--lcbc-local-text, var(--lcbc-primary-text)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="secondary"] {
  color: var(--lcbc-local-text, var(--lcbc-secondary-text)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="muted"] {
  color: var(--lcbc-local-text, var(--lcbc-muted-text)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="inverse"] {
  color: var(--lcbc-local-text, var(--lcbc-inverse-text)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="link"] {
  color: var(--lcbc-local-text, var(--lcbc-link)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="link"]:hover {
  color: var(--lcbc-link-hover) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="button"] {
  color: var(--lcbc-local-text, var(--lcbc-button-text)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="secondaryButton"] {
  color: var(--lcbc-local-text, var(--lcbc-secondary-button-text)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="selected"] {
  color: var(--lcbc-local-text, var(--lcbc-selected-text)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="input"] {
  color: var(--lcbc-local-text, var(--lcbc-input-text)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-text-role="success"] { color: var(--lcbc-success) !important; }
:root[${THEME_ATTR}] [data-lcbc-text-role="warning"] { color: var(--lcbc-warning) !important; }
:root[${THEME_ATTR}] [data-lcbc-text-role="error"] { color: var(--lcbc-error) !important; }

:root[${THEME_ATTR}] :where(header, nav, aside, [role="banner"], [role="navigation"], [data-lcbc-bg-role="header"], [data-lcbc-bg-role="sidebar"], ytd-masthead, ytd-guide-renderer, ytd-mini-guide-renderer, ytmusic-nav-bar, ytmusic-guide-renderer, #gb, #searchform, .navbar, .topbar, .sidebar, .sidenav, .side-nav, .drawer, .rail) {
  color: var(--lcbc-primary-text) !important;
}

:root[${THEME_ATTR}] :where(header, nav, aside, [role="banner"], [role="navigation"], [data-lcbc-bg-role="header"], [data-lcbc-bg-role="sidebar"], ytd-masthead, ytd-guide-renderer, ytd-mini-guide-renderer, ytmusic-nav-bar, ytmusic-guide-renderer, #gb, #searchform, .navbar, .topbar, .sidebar, .sidenav, .side-nav, .drawer, .rail) :where(a, button, [role="button"], [role="tab"], [aria-label], span, yt-formatted-string, tp-yt-paper-item, ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytmusic-guide-entry-renderer, ytmusic-tab-renderer) {
  color: inherit !important;
}

:root[${THEME_ATTR}] :where(header, nav, aside, [role="banner"], [role="navigation"], [data-lcbc-bg-role="header"], [data-lcbc-bg-role="sidebar"], ytd-masthead, ytd-guide-renderer, ytd-mini-guide-renderer, ytmusic-nav-bar, ytmusic-guide-renderer, #gb, #searchform, .navbar, .topbar, .sidebar, .sidenav, .side-nav, .drawer, .rail) :where(yt-icon, ytmusic-icon, tp-yt-iron-icon, iron-icon, .material-icons, .material-symbols-outlined, svg:not([class*="logo" i]):not([id*="logo" i])) {
  color: inherit !important;
  fill: currentColor !important;
  stroke: currentColor !important;
}

:root[${THEME_ATTR}] :where(header, nav, aside, [role="banner"], [role="navigation"], [data-lcbc-bg-role="header"], [data-lcbc-bg-role="sidebar"], ytd-masthead, ytd-guide-renderer, ytd-mini-guide-renderer, ytmusic-nav-bar, ytmusic-guide-renderer, #gb, #searchform, .navbar, .topbar, .sidebar, .sidenav, .side-nav, .drawer, .rail) :where(button, a[aria-label], [role="button"], [role="tab"], [aria-label]:not(input):not(textarea), ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytmusic-guide-entry-renderer, ytmusic-tab-renderer, ytmusic-cast-button, ytmusic-settings-button, ytmusic-menu-renderer, .gb_A, .gb_B, .gb_C, .gb_D, .gb_E, .gb_F) {
  color: var(--lcbc-primary-text) !important;
  opacity: 1 !important;
}

:root[${THEME_ATTR}] :where(header, nav, aside, [role="banner"], [role="navigation"], [data-lcbc-bg-role="header"], [data-lcbc-bg-role="sidebar"], ytd-masthead, ytd-guide-renderer, ytd-mini-guide-renderer, ytmusic-nav-bar, ytmusic-guide-renderer, #gb, #searchform, .navbar, .topbar, .sidebar, .sidenav, .side-nav, .drawer, .rail) :where(button, a[aria-label], [role="button"], [role="tab"], [aria-label]:not(input):not(textarea), ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer, ytmusic-guide-entry-renderer, ytmusic-tab-renderer, ytmusic-cast-button, ytmusic-settings-button, ytmusic-menu-renderer, .gb_A, .gb_B, .gb_C, .gb_D, .gb_E, .gb_F) :where(svg:not([class*="logo" i]):not([id*="logo" i]), svg:not([class*="logo" i]):not([id*="logo" i]) *, yt-icon, yt-icon *, ytmusic-icon, ytmusic-icon *, tp-yt-iron-icon, tp-yt-iron-icon *, iron-icon, iron-icon *, path, circle, rect, line, polyline, polygon) {
  color: var(--lcbc-primary-text) !important;
  fill: currentColor !important;
  stroke: currentColor !important;
  opacity: 1 !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_LOGO_SELECTORS}) {
  color: var(--lcbc-primary-text) !important;
  opacity: 1 !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_LOGO_SELECTORS}) :where(svg, svg *, yt-icon, yt-icon *, path, circle, rect, line, polyline, polygon) {
  color: var(--lcbc-primary-text) !important;
  fill: currentColor !important;
  stroke: revert !important;
  opacity: 1 !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_LOGO_SELECTORS}) :where([fill="#ff0000" i], [fill="#f00" i], [fill="red" i]) {
  color: #ff0033 !important;
  fill: #ff0033 !important;
  stroke: revert !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_LOGO_SELECTORS}) :where([fill="#ffffff" i], [fill="#fff" i], [fill="white" i]) {
  color: #ffffff !important;
  fill: #ffffff !important;
  stroke: revert !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_MUSIC_LOGO_SELECTORS}) {
  color: var(--lcbc-primary-text) !important;
  opacity: 1 !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_MUSIC_LOGO_SELECTORS}) :where(svg, svg *, yt-icon, yt-icon *, ytmusic-icon, ytmusic-icon *, path, circle, rect, line, polyline, polygon) {
  color: var(--lcbc-primary-text) !important;
  fill: currentColor !important;
  stroke: revert !important;
  opacity: 1 !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_MUSIC_LOGO_SELECTORS}) :where([fill="#ff0000" i], [fill="#f00" i], [fill="red" i]) {
  color: #ff0033 !important;
  fill: #ff0033 !important;
  stroke: revert !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_CHIP_SELECTORS}) {
  background-color: var(--lcbc-secondary-button-bg) !important;
  background-image: var(--lcbc-surface-gradient) !important;
  color: var(--lcbc-secondary-button-text) !important;
  border: 1px solid var(--lcbc-border) !important;
  border-radius: 10px !important;
  box-shadow: 0 1px 2px var(--lcbc-shadow) !important;
  opacity: 1 !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_CHIP_SELECTORS}) :where(a, span, yt-formatted-string, #text) {
  color: inherit !important;
}

:root[${THEME_ATTR}] :where(${YOUTUBE_SELECTED_CHIP_SELECTORS}) {
  background-color: var(--lcbc-selected-bg) !important;
  background-image: var(--lcbc-selected-gradient) !important;
  color: var(--lcbc-selected-text) !important;
  border-color: var(--lcbc-strong-border) !important;
  box-shadow: 0 2px 8px var(--lcbc-shadow) !important;
}

:root[${THEME_ATTR}] [data-lcbc-border-role="border"] {
  border-color: var(--lcbc-local-border, var(--lcbc-border)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-border-role="subtle"] {
  border-color: var(--lcbc-local-border, var(--lcbc-subtle-border)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-border-role="strong"] {
  border-color: var(--lcbc-local-border, var(--lcbc-strong-border)) !important;
}
:root[${THEME_ATTR}] [data-lcbc-border-role="accent"] {
  border-color: var(--lcbc-local-border, var(--lcbc-strong-accent)) !important;
}

:root[${THEME_ATTR}] [data-lcbc-control] {
  accent-color: var(--lcbc-accent) !important;
  caret-color: var(--lcbc-accent) !important;
  outline-color: var(--lcbc-accent) !important;
}

:root[${THEME_ATTR}] [data-lcbc-bg-role="button"]:hover,
:root[${THEME_ATTR}] [data-lcbc-bg-role="secondaryButton"]:hover,
:root[${THEME_ATTR}] [data-lcbc-bg-role="selected"]:hover,
:root[${THEME_ATTR}] [role="button"]:hover,
:root[${THEME_ATTR}] button:hover {
  background-color: var(--lcbc-hover-bg) !important;
}

:root[${THEME_ATTR}] img,
:root[${THEME_ATTR}] video,
:root[${THEME_ATTR}] canvas,
:root[${THEME_ATTR}] picture,
:root[${THEME_ATTR}] source,
:root[${THEME_ATTR}] svg,
:root[${THEME_ATTR}] iframe,
:root[${THEME_ATTR}] object,
:root[${THEME_ATTR}] embed,
:root[${THEME_ATTR}] ytd-thumbnail,
:root[${THEME_ATTR}] yt-img-shadow,
:root[${THEME_ATTR}] #thumbnail,
:root[${THEME_ATTR}] .html5-video-container,
:root[${THEME_ATTR}] .html5-main-video,
:root[${THEME_ATTR}] .ytp-cued-thumbnail-overlay-image,
:root[${THEME_ATTR}] [style*="background-image" i] {
  filter: none !important;
  opacity: 1 !important;
  mix-blend-mode: normal !important;
}

:root[${THEME_ATTR}] a:focus-visible,
:root[${THEME_ATTR}] button:focus-visible,
:root[${THEME_ATTR}] input:focus-visible,
:root[${THEME_ATTR}] select:focus-visible,
:root[${THEME_ATTR}] textarea:focus-visible,
:root[${THEME_ATTR}] [role="button"]:focus-visible,
:root[${THEME_ATTR}] [role="tab"]:focus-visible {
  outline: 2px solid ${t.accent} !important;
  outline-offset: 2px !important;
  box-shadow: 0 0 0 4px var(--lcbc-glow) !important;
}

${buildWebsiteAdapterCss()}
`;
}

function scheduleSemanticApply() {
  if (!activeTheme) return;
  clearTimeout(scheduledApply);
  scheduledApply = setTimeout(() => {
    applySemanticTheme(activeTheme, activeOptions);
  }, 120);
}

function observeDynamicContent() {
  if (themeObserver) themeObserver.disconnect();
  themeObserver = new MutationObserver((mutations) => {
    if (mutations.some(mutation => mutation.addedNodes.length)) scheduleSemanticApply();
  });
  themeObserver.observe(document.documentElement, { childList: true, subtree: true });
}

const ThemeEngine = {
  THEME_PRESETS,
  THEME_MAP,
  THEME_STYLE_ID,
  THEME_ATTR,
  WEBSITE_ADAPTERS,
  buildTheme,
  getReadableTextColor,
  ensureContrast,
  generateDarkTheme,
  generateLightTheme,
  resolveThemeForDisplayMode,
  getThemeById,
  generatePaletteFromColors,
  buildThemeCss,

  apply(theme, options) {
    this.remove();
    if (Utilities.clamp(options?.themeIntensity ?? 100, 0, 100) === 0) return;
    activeTheme = theme;
    activeOptions = options || {};

    const style = document.createElement('style');
    style.id = THEME_STYLE_ID;
    style.setAttribute('data-lcbc', 'true');
    style.textContent = buildThemeCss(theme, activeOptions);
    document.documentElement.appendChild(style);
    document.documentElement.setAttribute(THEME_ATTR, theme.id || 'custom');

    applySemanticTheme(theme, activeOptions);
    observeDynamicContent();
  },

  remove() {
    clearTimeout(scheduledApply);
    scheduledApply = null;
    activeTheme = null;
    activeOptions = null;
    if (themeObserver) themeObserver.disconnect();
    themeObserver = null;
    restoreInlineStyles();
    restoreThemeAttributes();

    const existing = document.getElementById(THEME_STYLE_ID);
    if (existing) existing.remove();
    document.documentElement.removeAttribute(THEME_ATTR);
  },

  isApplied() {
    return !!document.getElementById(THEME_STYLE_ID);
  }
};

if (typeof module !== 'undefined') { module.exports = ThemeEngine; }
