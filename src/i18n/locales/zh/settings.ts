import type en from '../en/settings'

const settings: typeof en = {
  settings: {
    title: '设置',
    subtitle:
      '配置 Futu 连接、分类标签、数据库持久化与显示偏好。自选股代码现已移至「自选」页面。',
    display: {
      title: '显示',
      theme: '主题',
      themeDark: '深色',
      themeLight: '浅色',
      themeSystem: '跟随系统',
      density: '密度',
      densityComfortable: '宽松',
      densityCompact: '紧凑',
      language: '语言',
      flashOnTick: '价格跳动时闪烁',
      flashOnTickHint: '报价变动时以淡绿色/淡红色高亮提示。',
      showAfterHours: '显示盘前盘后行情',
      showAfterHoursHint: '在可用时纳入盘前与盘后报价。',
      reset: '重置显示偏好',
    },
  },
}

export default settings
