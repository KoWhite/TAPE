import type en from '../en/alerts'

const alerts: typeof en = {
  alerts: {
    title: '提醒',
    subtitle: '规则触发时弹出浏览器通知 · 重新启用后可再次触发',
    permissionDenied:
      '通知已被拦截 —— 提醒仍会标记为已触发，但不会弹窗。请在浏览器设置中重新开启。',
    permissionDefault: '开启浏览器通知以接收提醒弹窗。',
    enable: '开启',
    emptyMobile: '还没有提醒。打开个股详情页并点击铃铛即可添加。',
    emptyDesktop: '还没有提醒 —— 打开个股详情页并点击铃铛即可添加。',
    triggered: '已触发 {time}',
    paused: '已暂停',
    armed: '监控中',
    reArm: '重新启用',
    pause: '暂停',
    resume: '恢复',
    remove: '移除',
    colSymbol: '代码',
    colRule: '规则',
    colLast: '最新',
    colStatus: '状态',
    type: {
      above: '高于',
      below: '低于',
      upBy: '上涨',
      downBy: '下跌',
    },
    legend: '类型说明：{above}/{below} 监控绝对价格；{upBy}/{downBy} 监控相对上一收盘的涨跌幅。',
  },
}

export default alerts
