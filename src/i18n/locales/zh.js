// ============================================================
// 中文翻译 — SocialPost AI 界面文字
// ============================================================

const zh = {
  // Tab bar
  tab_generate: '生成',
  tab_history: '历史',
  tab_profile: '我的',

  // Generate screen
  nav_brand: 'SocialPost AI',
  select_platform: '选择平台',
  enter_topic: '输入主题',
  topic_placeholder: '想发什么？说个方向，剩下的交给我',
  select_style: '选择风格',
  tone_thermometer: '语气温度计',
  word_count: '字数控制',
  chars: '字符',
  generate_copy: '生成文案',
  remaining_today: '剩余 {count} 次 / 今日',
  remaining_unlimited: '今日不限次',
  recent: '最近',

  // Tone labels
  tone_0_2: '0-2 专业沉稳',
  tone_3_4: '3-4 正式亲和',
  tone_5_6: '5-6 活泼网感',
  tone_7_8: '7-8 轻松随意',
  tone_9_10: '9-10 口语化',
  tone_hint: '← 更专业 · 更随意 →',

  // Tone level labels
  tone_professional: '专业沉稳',
  tone_formal_warm: '正式亲和',
  tone_lively_trendy: '活泼网感',
  tone_casual_relaxed: '轻松随意',
  tone_conversational: '口语化',

  // Style labels
  style_formal: '沉稳',
  style_lively: '活泼',
  style_elegant: '高雅',
  style_casual: '随性',

  // Result drawer
  copy_generated: '✨ 生成完成！',
  ai_generated: 'AI 生成',
  mock_preview: '模拟预览',
  brand_voice_badge: '🎙️ 品牌语调',
  via_provider: 'via {provider}',
  copy: '复制',
  regenerate: '重新生成',
  favorite: '收藏',
  save: '保存',
  copied: '已复制',
  copied_to_clipboard: '已复制到剪贴板',
  saved: '已保存',
  copy_saved: '文案已保存到历史记录',

  // Cultural check
  cultural_fit_check: '文化适配检测',
  cultural_good: '良好',
  cultural_fair: '一般',
  cultural_poor: '较差',
  cultural_no_issues: '未检测到文化风险',
  cultural_safe: '您的文案对全球受众是文化安全的',
  cultural_suggestions: '💡 修改建议：',
  cultural_apply: '一键修改',
  cultural_apply_title: '应用文化适配修改',
  cultural_apply_desc: '将按以下建议替换文案，确认后生效：',
  cultural_no_change: '未发现可自动修改的内容',
  cultural_apply_emoji: '表情数量 {before} → {after}（仅保留关键表情）',
  cultural_manual_title: '需手动调整的项目',
  cultural_manual_desc: '以下内容无法自动替换（避免误改价格、日期、数量等关键信息），请手动修改：',
  cultural_manual_after: '已应用自动修改。以下内容仍需你手动确认：',
  cultural_manual_more: '… 以及另外 {count} 项',

  // History screen
  history: '历史',
  search_history: '搜索历史记录...',
  clear: '清空',
  all: '全部',
  filter_viral: '短视频',
  filter_visual: '图片',
  filter_community: '社群',
  filter_brief: '短文字',
  filter_professional: '专业',
  no_history: '暂无历史记录',
  select_all: '全选',
  deselect_all: '取消全选',
  delete: '删除',
  cancel: '取消',
  confirm_delete: '确认删除',
  delete_count: '删除 {count} 条选中记录？',
  clear_all: '清空全部',
  clear_all_confirm: '删除所有历史记录？此操作不可恢复。',
  just_now: '刚刚',
  min_ago: '{count}分钟前',
  hr_ago: '{count}小时前',
  day_ago: '{count}天前',

  // Profile screen
  content_creator: '内容创作者',
  free_plan: '免费版',
  theme: '主题',
  theme_style: '风格',
  style_scifi: '科幻',
  style_dreamy: '梦幻',
  style_cartoon: '卡通',
  style_minimal: '简洁',
  usage: '使用统计',
  today: '今日',
  this_month: '本月',
  total: '总计',
  favorites: '收藏列表',
  no_favorites: '暂无收藏',
  items: '条',
  brand_voice_learning: '品牌语调学习',
  active: '已启用',
  not_set: '未设置',
  ai_model: 'AI 模型',
  language: '语言',
  privacy_policy: '隐私政策',
  terms_of_service: '用户协议',
  data_storage_notice: '数据存储说明',
  ai_content_notice: 'AI 内容声明',
  contact_us: '联系我们',
  rate_app: '给App评分',
  select_ai_model: '🤖 选择 AI 模型',
  model_change_effect: '切换将在下次生成时生效',
  model_switched: '✅ 模型已切换',
  now_using: '当前使用：{name}',
  done: '完成',

  // Language picker
  select_language: '🌐 选择语言',
  interface_language: '界面语言',
  output_language: '输出语言',
  english: 'English',
  chinese: '中文',

  // Brand voice screen
  brand_voice_title: '品牌语调学习',
  teach_ai_voice: '教 AI 你的品牌语调',
  brand_voice_desc: '粘贴 3-5 条你最好的社媒文案示例，AI 将学习你的语气、词汇和风格，生成符合品牌调性的文案。',
  samples_count: '{count} / {max} 条样本',
  sample: '样本',
  required: '必填',
  optional: '选填',
  paste_example: '在此粘贴你的第{ordinal}条最佳文案示例...',
  save_brand_voice: '保存品牌语调',
  saving: '保存中...',
  brand_voice_saved: '✅ 品牌语调已保存',
  brand_voice_saved_desc: '已保存 {count} 条样本，生成的文案将匹配此语调！',
  need_more_samples: '需要更多样本',
  need_more_desc: '请提供至少 {count} 条文案示例来定义品牌语调，当前有 {current} 条。',
  clear_brand_voice: '清空品牌语调？',
  clear_brand_voice_desc: '将删除所有已保存的品牌语调样本。',
  tips: '💡 提示',
  tip_1: '• 使用你表现最好的帖子作为示例',
  tip_2: '• 包含多样性：不同主题、不同平台',
  tip_3: '• 更多示例 = 更精准的语调匹配',
  tip_4: '• 至少需要 2 条样本才能启用',
  back: '‹ 返回',

  // Generate alerts
  missing_topic: '缺少主题',
  missing_topic_desc: '请输入主题或关键词',
  no_platform: '未选择平台',
  no_platform_desc: '请至少选择一个平台',
  limit_reached: '已达上限',
  limit_reached_desc: '今日 8 次生成已用完，明天再来吧！',
  generation_failed: '生成失败',
  generation_failed_desc: '出了点问题，请重试。',

  // Cultural check — detail titles
  cultural_sensitive_emoji: '文化敏感表情',
  emoji_overuse: '表情过多',
  cultural_sensitive_numbers: '文化敏感数字',
  religious_references: '宗教 / 节日引用',
  slang_ambiguity: '跨文化俚语歧义',
  level_high_risk: '❌ 高风险',
  level_medium: '⚠️ 中等',
  level_info: 'ℹ️ 提示',
  emoji_overuse_desc: '发现 {count} 个表情 — 过多表情可能降低专业性和可信度。',
  emoji_overuse_suggestion: '建议最多使用 2-3 个关键表情，让文字传递核心信息。',

  // Recent history
  untitled: '无标题',

  // Brand voice screen — extra
  clear_all: '清空全部',
  save_failed: '保存失败',
  save_failed_desc: '无法保存品牌语调样本。',

  // Result drawer — extra
  nothing_to_copy: '无内容可复制',
  nothing_to_copy_desc: '没有可复制的文本',
  copy_failed: '复制失败',
  copy_failed_desc: '无法复制到剪贴板',
  save_failed_drawer: '保存失败',
  save_failed_desc_drawer: '无法保存到历史记录',
  placeholder_generated: '生成的文案将显示在这里...',

  // Generate screen — extra
  unfavorited: '已取消收藏',
  favorited: '已收藏',
  removed_from_favorites: '已从收藏中移除',
  added_to_favorites: '已添加到收藏',

  // Profile screen — extra
  privacy_desc: '我们重视您的隐私保护',
  terms_desc: '用户协议',
  contact_desc: '邮箱：seal023@163.com',
  rate_thanks: '谢谢！❤️',
  rate_desc: '您的评分是我们进步的动力！',
  rate_store_unavailable: '暂无法打开 App Store 评分页（上架后可用）。',
  favorites_count: '您有 {count} 条收藏文案',

  // Common
  confirm: '确认',
  select_date: '选择日期',
  more: '更多',
  select_all: '全选',

  // Subscription
  upgrade_to_pro: '升级到 Pro',
  subscription_active: '已订阅 · Pro 会员',
  already_subscribed_title: '你已订阅 Pro',
  already_subscribed_desc: '你的 Pro 会员已生效，无需重复购买。如需管理或取消订阅，请前往「设置 → Apple ID → 订阅」。',
  paywall_free_trial_then: '免费试用 7 天，之后 {price}',
  paywall_annual_avg: '均摊 {price}/月',
  coming_soon: '即将上线',
  voice_input_desc: '语音输入功能即将上线！',
  voice_input: '语音输入',
  voice_input_manual_desc: '请在下方输入您的主题或关键词：',
  voice_needs_dev_build: '语音识别需要开发版构建才能使用。请运行：\n\nnpx expo run:android\n或\nnpx expo run:ios\n\n以启用真正的语音转文字功能。',
  voice_permission_denied: '麦克风权限被拒绝',
  voice_permission_desc: '请在设置中开启麦克风权限以使用语音输入。',
  voice_error: '语音识别错误',
  voice_error_desc: '语音识别遇到错误，请重试。',
  voice_unavailable_title: '语音输入暂不可用',
  voice_unavailable_desc: '当前版本语音输入功能暂不可用，请使用键盘输入主题。',
  voice_no_api_key: '语音识别密钥未配置。请在 .env 设置 EXPO_PUBLIC_ASR_API_KEY（须为新加坡或北京区域的 Key；美国区 Key 无法用于实时语音）。',
  voice_no_speech: '未检测到语音，请重试。',
  voice_connecting: '正在连接语音识别服务...',
  voice_ws_error: '语音识别服务连接失败，请检查网络后重试。',
  voice_stream_error: '当前版本语音输入功能暂不可用，请使用键盘输入主题。',
  voice_mic_busy: '麦克风被其他应用占用，请关闭后重试。',
  voice_listening: '正在聆听...',
  voice_stop: '停止录音',
  voice_hint: '请开始说话...',
  share: '分享',
  screenshot: '截图',
  screenshot_saved: '截图已保存',
  screenshot_saved_desc: '截图已保存到相册。',
  screenshot_failed: '截图失败',
  screenshot_failed_desc: '无法保存截图，请检查相册权限。',
  output_language_desc: '选择生成文案的语言',
  input_language: '输入语言（语音）',
  input_language_desc: '选择语音识别的语言（语音输入）',
  generated_by_ai: '由 AI 生成',
  ai_disclaimer_title: 'AI 生成内容声明',
  ai_disclaimer_desc: 'SocialPost AI 生成的内容由人工智能创建，发布前请审核验证。AI 生成内容可能包含不准确之处。',
  ai_disclaimer_ok: '我了解了',

  // Scene info
  scene_info: '场景信息',
  scene_info_hint: '添加场景信息，让文案更精准',
  location_auto: '{city}（自动定位）',
  location_manual_placeholder: '未获取位置，请手动输入',
  location_input_placeholder: '输入地点（如：上海、纽约）',
  auto_detected: '自动',
  image_desc_placeholder: '描述产品图片或场景...',
  trending: '热门话题',

  // Platform names
  platform_viral: '短视频',
  platform_visual: '图片',
  platform_brief: '短文字',
  platform_community: '社群',
  platform_professional: '专业',
  platform_video: '视频',
  platform_discover: '发现',
  platform_chat: '聊天',

  // Trial banner
  trial_banner_days: '⏳ 免费试用还剩 {days} 天 · 到期后每日仅可生成 3 条',
  trial_banner_urgent: '⚠️ 免费试用还剩 {days} 天 · 立即升级 Pro，保留全部功能',
  trial_banner_last_day: '🔥 免费试用今天到期 · 升级 Pro 首月仅 $1.99',

  // Trial expired popup
  trial_expired_title: '免费试用已结束',
  trial_expired_desc: '您的 7 天免费试用已到期。免费版每日可生成 3 条文案，品牌语调、收藏、语音输入和文化适配等功能仅限 Pro 用户。',
  continue_free: '继续免费使用',
  upgrade_pro: '升级 Pro',

  // Feature locks
  pro_feature_lock: '此功能仅限 Pro 用户使用',
  pro_feature_lock_desc: '升级 Pro 解锁品牌语调、收藏、文化适配等全部功能。',
  pro_only_feature: 'Pro 专属功能',
  daily_limit_reached: '今日免费次数已用完',
  daily_limit_reached_desc: '免费用户每日可生成 3 条。升级 Pro 享受无限生成！',
  not_now: '稍后再说',

  // Subscription state
  trial_badge: '免费试用 · 剩余 {days} 天',
  free_plan_limited: '免费版 · 每日 3 条',
  upgrade_unlock: '升级 Pro 解锁无限生成',
  pro_member: 'Pro 会员 👑',
  go_pro_subtitle: '解锁无限 AI 文案生成',
  monthly: '月度',
  annual: '年度',

  // Brand voice status
  need_min_2_samples: '至少需要 2 条样本才能启用品牌语调',
  add_samples: '添加样本',
  brand_voice_count_label: '{count}/5',
  select_brand_voice_hint: '选择一种品牌语调应用：',
  no_brand_voice_selected: '请选择品牌语调',

  // Brand voice tone types
  voice_professional: '专业型',
  voice_warm: '温暖型',
  voice_humorous: '幽默型',
  voice_minimal: '简约型',
  voice_inspirational: '激励型',

  // Profile editing
  edit_username: '编辑用户名',
  change_avatar: '更换头像',
  username_placeholder: '输入昵称...',

  // Subscription pricing
  subscribe_monthly: '$6.99/月',
  subscribe_annual: '$49.99/年',
  best_value: '最划算',

  // In-App Purchase — IAP integration
  iap_not_available_title: '订阅即将上线',
  iap_not_available_desc: '当前版本暂不支持应用内订阅。您可以在免费试用期内继续使用所有功能。订阅功能将在后续版本中开放。',
  purchase_failed_title: '购买失败',
  purchase_failed_desc: '购买无法完成，请稍后重试。',
  purchase_success_title: '购买成功',
  purchase_success_desc: '欢迎升级 Pro！全部功能已解锁，尽情享受无限 AI 文案生成。',
  restore_success_title: '恢复成功',
  restore_success_desc: '您的 Pro 订阅已成功恢复。',
  restore_failed_title: '恢复失败',
  restore_failed_desc: '未找到可恢复的有效订阅。如有疑问，请联系客服。',
  restore_no_subscription: '未找到可恢复的有效订阅',
  restore_failed_not_available: '当前环境不支持内购（Expo Go）。',
  restore_revoked_title: '已更新为免费版',
  restore_revoked_desc: 'Apple 账号当前没有有效订阅，Pro 权限已更新为免费版。',
  subscribe_btn: '订阅',
  subscribe_btn_loading: '处理中...',
  restore_purchases: '恢复购买',
  restore_purchases_loading: '恢复中...',
  manage_subscription: '管理订阅',
  manage_subscription_failed_title: '无法打开订阅管理',
  manage_subscription_failed_desc: '请稍后重试。你也可以前往「设置 → Apple ID → 订阅」手动管理。',
  pro_unlocked_title: 'Pro 已解锁',
  pro_unlocked_desc: '感谢订阅！所有 Pro 功能已激活。',

  // History retention notice (info icon on subscription page)
  history_info_title: '历史记录存储',
  history_info_desc: '历史记录保存在您的手机本地。卸载 App 后所有数据将被清除。',
  history_footer_note: '历史记录和用户数据仅保存在您的手机本地。',

  // Subscription — feature comparison row labels
  feat_ai_copy: 'AI 文案生成',
  feat_voice_input: '语音输入',
  feat_brand_voice: '品牌语调',
  feat_cultural_check: '文化适配',
  feat_history_retention: '历史记录',
  feat_avatar_username: '头像 + 昵称',

  // Unsaved changes prompt
  unsaved_changes_title: '文案已修改',
  unsaved_changes_desc: '是否保存修改？',
  dont_save: '不保存',
  save: '保存',

  // Data storage notice
  data_storage_title: '您的数据仅保存在本设备',
  data_storage_desc: '您的数据仅存储在本设备上。历史记录、收藏和设置仅保存在您的手机中。我们不会上传或收集您的任何数据。卸载应用后数据将丢失，但重新登录 Apple ID 后可恢复订阅状态。',
  data_storage_ok: '我了解了',

  // Apple ID login
  sign_in_with_apple: '使用 Apple 登录',
  sign_out: '退出登录',
  apple_sign_in_failed: '登录失败，请重试。',
  apple_sign_in_required: '请使用 Apple ID 登录以继续。',
  apple_bound: '已绑定 Apple ID',
  apple_manage_account: '管理 Apple 账号',
  apple_sign_out_confirm: '退出登录将清除本地订阅状态和 Pro 权限，不会删除您的 Apple 账户。',
  apple_id_subscribed: 'Apple ID（已订阅）',
  welcome_back: '欢迎回来！',

  // Login screen
  login_title: 'SocialPost AI',
  login_subtitle: '登录后开始创作',
  login_terms: '继续即表示您同意我们的隐私政策和服务条款。',

  // Trial reminder
  trial_remind_7_4: '您的免费试用还剩 {days} 天，到期后将转为免费版（每日 3 条）。升级 Pro 可继续享受全部功能。',
  trial_remind_3_1: '您的免费试用还剩 {days} 天，请立即升级 Pro，以免功能受限。',
  trial_remind_last_day: '您的免费试用今天到期！升级 Pro 仅需 $6.99/月。',
  remind_later: '稍后提醒',

  // Permission tooltips
  pro_member_badge: 'Pro 会员 👑',
  feature_locked_upgrade: '此功能需要 Pro 版本，升级后可使用。',
  upgrade_to_unlock: '升级解锁',
  locked: '已锁定',

  // Developer / Testing — quota reset (QA builds only)
  dev_reset_quota: '恢复测试额度',
  dev_reset_quota_desc: '此操作会重置免费生成次数，仅用于测试。',
  dev_reset_today: '重置今日免费次数',
  dev_reset_trial: '恢复 7 天试用',
  dev_reset_done: '已重置，可以开始测试了。',
  diag_open: '诊断自检',
  diag_title: '🩺 诊断自检',
};

export default zh;
