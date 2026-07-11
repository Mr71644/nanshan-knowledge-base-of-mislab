// 甘蔗育种中心-ZhangLab (GXU)  绿色自然调
export default {
  id: 'gxu',
  htmlTitle: '甘蔗育种中心-ZhangLab',
  faviconPath: '/src/assets/gxuicon.png',

  brand: {
    name: '甘蔗育种中心',
    subtitle: 'ZhangLab · 广西大学农学院',
  },

  colors: {
    accent: '#5e963c',
    accentHover: '#72b04a',
    accentDeep: '#4c7a2e',
    accentRgb: '94, 150, 60',
    accentDeepRgb: '76, 122, 46',
    accentHoverRgb: '114, 176, 74',
    pageBg: '#f0f3ed',
    loginAccent: '#388e3c',
    loginAccentHover: '#43a047',
    loginAccentDeep: '#2e7d32',
  },

  bg: {
    colorSaturation: '60%',
    colorBrightness: '55%',
    colorAlpha: 0.30,
    backgroundColor: '#f0f3ed',
    huePalette: [75, 85, 95, 105, 115, 125, 38, 42],
  },

  antdTheme: {
    token: { colorPrimary: '#5e963c' },
    components: {
      Checkbox: {
        colorPrimary: '#5e963c',
        colorPrimaryHover: '#4c7a2e',
        colorBorder: '#b0c4a8',
      },
    },
  },
}
