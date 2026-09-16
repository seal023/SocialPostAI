// ============================================================
// English translations — all UI text for SocialPost AI
// ============================================================

const en = {
  // Tab bar
  tab_generate: 'Generate',
  tab_history: 'History',
  tab_profile: 'Profile',

  // Generate screen
  nav_brand: 'SocialPost AI',
  select_platform: 'Select Platform',
  enter_topic: 'Enter Topic',
  topic_placeholder: "What do you want to post? Give me a direction, I'll handle the rest",
  select_style: 'Select Style',
  tone_thermometer: 'Tone Thermometer',
  word_count: 'Word Count',
  chars: 'chars',
  generate_copy: 'Generate Copy',
  remaining_today: 'Remaining {count} times / Today',
  remaining_unlimited: 'Unlimited today',
  recent: 'Recent',

  // Tone labels
  tone_0_2: '0-2 Professional',
  tone_3_4: '3-4 Formal & Warm',
  tone_5_6: '5-6 Lively & Trendy',
  tone_7_8: '7-8 Casual & Relaxed',
  tone_9_10: '9-10 Conversational',
  tone_hint: '← More Professional · More Casual →',

  // Tone level labels
  tone_professional: 'Professional',
  tone_formal_warm: 'Formal & Warm',
  tone_lively_trendy: 'Lively & Trendy',
  tone_casual_relaxed: 'Casual & Relaxed',
  tone_conversational: 'Conversational',

  // Style labels
  style_formal: 'Formal',
  style_lively: 'Lively',
  style_elegant: 'Elegant',
  style_casual: 'Casual',

  // Result drawer
  copy_generated: '✨ Copy Generated!',
  ai_generated: 'AI Generated',
  mock_preview: 'Mock Preview',
  brand_voice_badge: '🎙️ Brand Voice',
  via_provider: 'via {provider}',
  copy: 'Copy',
  regenerate: 'Regenerate',
  favorite: 'Favorite',
  save: 'Save',
  copied: 'Copied',
  copied_to_clipboard: 'Copy has been copied to clipboard',
  saved: 'Saved',
  copy_saved: 'Copy saved to history',

  // Cultural check
  cultural_fit_check: 'Cultural Fit Check',
  cultural_good: 'Good',
  cultural_fair: 'Fair',
  cultural_poor: 'Poor',
  cultural_no_issues: 'No cultural issues detected',
  cultural_safe: 'Your copy appears culturally safe for global audiences',
  cultural_suggestions: '💡 Suggestions:',
  cultural_apply: 'Apply All Fixes',
  cultural_apply_title: 'Apply cultural fixes',
  cultural_apply_desc: 'The following replacements will be applied to your copy:',
  cultural_no_change: 'Nothing to change automatically',
  cultural_apply_emoji: 'Emoji count {before} → {after} (key emojis only)',
  cultural_manual_title: 'Items to Adjust Manually',
  cultural_manual_desc: 'These items cannot be auto-replaced (to avoid corrupting prices, dates or counts). Please edit them manually:',
  cultural_manual_after: 'Auto-fixes applied. These still need your review:',
  cultural_manual_more: '… and {count} more',

  // History screen
  history: 'History',
  search_history: 'Search history...',
  clear: 'Clear',
  all: 'All',
  filter_viral: 'Short Video',
  filter_visual: 'Image',
  filter_community: 'Community',
  filter_brief: 'Short Text',
  filter_professional: 'Professional',
  no_history: 'No history yet',
  select_all: 'Select All',
  deselect_all: 'Deselect All',
  delete: 'Delete',
  cancel: 'Cancel',
  confirm_delete: 'Confirm Delete',
  delete_count: 'Delete {count} selected records?',
  clear_all: 'Clear All',
  clear_all_confirm: 'Delete all history? This cannot be undone.',
  just_now: 'Just now',
  min_ago: '{count}m ago',
  hr_ago: '{count}h ago',
  day_ago: '{count}d ago',

  // Profile screen
  content_creator: 'Content Creator',
  free_plan: 'Free Plan',
  theme: 'Theme',
  theme_style: 'Theme Style',
  style_scifi: 'Sci-Fi',
  style_dreamy: 'Dreamy',
  style_cartoon: 'Cartoon',
  style_minimal: 'Minimal',
  usage: 'Usage',
  today: 'Today',
  this_month: 'This Month',
  total: 'Total',
  favorites: 'Favorites',
  no_favorites: 'No favorites yet',
  items: 'items',
  brand_voice_learning: 'Brand Voice Learning',
  active: 'Active',
  not_set: 'Not Set',
  ai_model: 'AI Model',
  language: 'Language',
  privacy_policy: 'Privacy Policy',
  terms_of_service: 'Terms of Service',
  data_storage_notice: 'Data Storage Policy',
  ai_content_notice: 'AI Content Disclaimer',
  contact_us: 'Contact Us',
  rate_app: 'Rate App',
  select_ai_model: '🤖 Select AI Model',
  model_change_effect: 'Changes take effect on next generation',
  model_switched: '✅ Model Switched',
  now_using: 'Now using: {name}',
  done: 'Done',

  // Language picker
  select_language: '🌐 Select Language',
  interface_language: 'Interface Language',
  output_language: 'Output Language',
  english: 'English',
  chinese: 'Chinese',

  // Brand voice screen
  brand_voice_title: 'Brand Voice Learning',
  teach_ai_voice: 'Teach AI Your Brand Voice',
  brand_voice_desc: 'Paste 3-5 examples of your best social media copy. The AI will learn your tone, vocabulary, and style to generate copy that sounds like your brand.',
  samples_count: '{count} of {max} samples',
  sample: 'Sample',
  required: 'Required',
  optional: 'Optional',
  paste_example: 'Paste your {ordinal} best copy example here...',
  save_brand_voice: 'Save Brand Voice',
  saving: 'Saving...',
  brand_voice_saved: '✅ Brand Voice Saved',
  brand_voice_saved_desc: '{count} samples saved. Your generated copy will now match this voice!',
  need_more_samples: 'Need More Samples',
  need_more_desc: 'Please provide at least {count} copy examples to define your brand voice. You have {current}.',
  clear_brand_voice: 'Clear Brand Voice?',
  clear_brand_voice_desc: 'This will remove all your saved brand voice samples.',
  tips: '💡 Tips',
  tip_1: '• Use your highest-performing posts as examples',
  tip_2: '• Include variety: different topics, different platforms',
  tip_3: '• More examples = more accurate voice matching',
  tip_4: '• Minimum 2 samples required for activation',
  back: '‹ Back',

  // Generate alerts
  missing_topic: 'Missing Topic',
  missing_topic_desc: 'Please enter a topic or keywords',
  no_platform: 'No Platform',
  no_platform_desc: 'Please select at least one platform',
  limit_reached: 'Limit Reached',
  limit_reached_desc: 'You\'ve used all 8 generations for today. Come back tomorrow!',
  generation_failed: 'Generation Failed',
  generation_failed_desc: 'Something went wrong. Please try again.',

  // Cultural check — detail titles
  cultural_sensitive_emoji: 'Culturally Sensitive Emoji',
  emoji_overuse: 'Emoji Overuse',
  cultural_sensitive_numbers: 'Culturally Sensitive Numbers',
  religious_references: 'Religious / Holiday References',
  slang_ambiguity: 'Cross-Cultural Slang Ambiguity',
  level_high_risk: '❌ High Risk',
  level_medium: '⚠️ Medium',
  level_info: 'ℹ️ Info',
  emoji_overuse_desc: 'Found {count} emojis — excessive emoji use may reduce credibility and professionalism.',
  emoji_overuse_suggestion: 'Reduce to 2-3 key emojis maximum. Let the words carry the message.',

  // Recent history
  untitled: 'Untitled',

  // Brand voice screen — extra
  clear_all: 'Clear All',
  save_failed: 'Save Failed',
  save_failed_desc: 'Could not save brand voice samples.',

  // Result drawer — extra
  nothing_to_copy: 'Nothing to Copy',
  nothing_to_copy_desc: 'No text to copy',
  copy_failed: 'Copy Failed',
  copy_failed_desc: 'Could not copy to clipboard',
  save_failed_drawer: 'Save Failed',
  save_failed_desc_drawer: 'Could not save to history',
  placeholder_generated: 'Generated copy will appear here...',

  // Generate screen — extra
  unfavorited: 'Unfavorited',
  favorited: 'Favorited',
  removed_from_favorites: 'Removed from favorites',
  added_to_favorites: 'Added to favorites',

  // Profile screen — extra
  privacy_desc: 'We value your privacy protection',
  terms_desc: 'Terms of Service',
  contact_desc: 'Email: seal023@163.com',
  rate_thanks: 'Thanks! ❤️',
  rate_desc: 'Your rating powers our progress!',
  rate_store_unavailable: 'Could not open the App Store rating page (available after release).',
  favorites_count: 'You have {count} favorited copies',

  // Common
  confirm: 'Confirm',
  select_date: 'Select Date',
  more: 'more',
  select_all: 'Select All',

  // Subscription
  upgrade_to_pro: 'Upgrade to Pro',
  subscription_active: 'Subscribed · Pro',
  subscription_active_hint: 'You are already a Pro member. To change or cancel, use "Manage Subscription" below.',
  already_subscribed_title: "You're already subscribed",
  already_subscribed_desc: 'Your Pro membership is active — no need to purchase again. To manage or cancel, go to Settings → Apple ID → Subscriptions.',
  paywall_free_trial_then: 'Start 7-day free trial, then {price}',
  paywall_annual_avg: '{price}/mo avg',
  coming_soon: 'Coming Soon',
  voice_input_desc: 'Voice input feature is coming soon!',
  voice_input: 'Voice Input',
  voice_input_manual_desc: 'Type your topic or keywords below:',
  voice_needs_dev_build: 'Voice recognition requires a development build. Please run:\n\nnpx expo run:android\nor\nnpx expo run:ios\n\nto enable real speech-to-text.',
  voice_permission_denied: 'Microphone Access Denied',
  voice_permission_desc: 'Please enable microphone access in Settings to use voice input.',
  voice_error: 'Voice Error',
  voice_error_desc: 'Speech recognition encountered an error. Please try again.',
  voice_unavailable_title: 'Voice Input Unavailable',
  voice_unavailable_desc: 'Voice input is temporarily unavailable in this build. Please type your topic using the keyboard.',
  voice_no_api_key: 'ASR key not configured. Set EXPO_PUBLIC_ASR_API_KEY in .env (must be a Singapore or Beijing region key; US-region keys cannot be used for realtime ASR).',
  voice_no_speech: 'No speech detected. Please try again.',
  voice_connecting: 'Connecting to speech recognition service...',
  voice_ws_error: 'Speech recognition service connection failed. Please check your network and retry.',
  voice_stream_error: 'Voice input is temporarily unavailable in this build. Please type your topic using the keyboard.',
  voice_mic_busy: 'The microphone is occupied by another app. Please close it and try again.',
  voice_listening: 'Listening...',
  voice_stop: 'Stop Recording',
  voice_hint: 'Start speaking...',
  share: 'Share',
  screenshot: 'Screenshot',
  screenshot_saved: 'Screenshot Saved',
  screenshot_saved_desc: 'Screenshot has been saved to your photo album.',
  screenshot_failed: 'Screenshot Failed',
  screenshot_failed_desc: 'Could not save screenshot. Please check photo album permissions.',
  output_language_desc: 'Choose the language for generated copy',
  input_language: 'Input Language (Voice)',
  input_language_desc: 'Choose the language for speech recognition (voice input)',
  generated_by_ai: 'Generated by AI',
  ai_disclaimer_title: 'AI-Generated Content',
  ai_disclaimer_desc: 'Content generated by SocialPost AI is created by artificial intelligence. Please review and verify before publishing. AI-generated content may contain inaccuracies.',
  ai_disclaimer_ok: 'I Understand',

  // Scene info
  scene_info: 'Scene Info',
  scene_info_hint: 'Add scene info to make copy more precise',
  location_auto: '{city} (Auto)',
  location_manual_placeholder: 'Location unavailable, enter manually',
  location_input_placeholder: 'Enter location (e.g. Shanghai, New York)',
  auto_detected: 'Auto',
  image_desc_placeholder: 'Describe the product image or scene...',
  trending: 'Trending',

  // Platform names
  platform_viral: 'Viral',
  platform_visual: 'Visual',
  platform_brief: 'Brief',
  platform_community: 'Community',
  platform_professional: 'Professional',
  platform_video: 'Video',
  platform_discover: 'Discover',
  platform_chat: 'Chat',

  // Trial banner
  trial_banner_days: '⏳ Free trial: {days} days left · Only 3/day after expiry',
  trial_banner_urgent: '⚠️ Free trial: {days} days left · Upgrade Pro to keep all features',
  trial_banner_last_day: '🔥 Free trial expires today · Upgrade Pro for just $6.99/mo',

  // Trial expired popup
  trial_expired_title: 'Free Trial Expired',
  trial_expired_desc: 'Your 7-day free trial has ended. Free tier allows 3 generations per day. Brand voice, favorites, voice input, and cultural check are Pro-only features.',
  continue_free: 'Continue Free',
  upgrade_pro: 'Upgrade Pro',

  // Feature locks
  pro_feature_lock: 'Pro Feature',
  pro_feature_lock_desc: 'Upgrade to Pro to unlock brand voice, favorites, cultural check and more.',
  pro_only_feature: 'Pro-only feature',
  daily_limit_reached: 'Daily Free Limit Reached',
  daily_limit_reached_desc: 'Free users can generate 3 copies per day. Upgrade Pro for unlimited!',
  not_now: 'Not Now',

  // Subscription state
  trial_badge: 'Free Trial · {days} days left',
  free_plan_limited: 'Free · 3/day',
  upgrade_unlock: 'Upgrade Pro for unlimited',
  pro_member: 'Pro Member 👑',
  go_pro_subtitle: 'Unlock unlimited AI copy generation',
  monthly: 'Monthly',
  annual: 'Annual',

  // Brand voice status
  need_min_2_samples: 'At least 2 samples needed to enable brand voice',
  add_samples: 'Add Samples',
  brand_voice_count_label: '{count}/5',
  select_brand_voice_hint: 'Select one brand voice tone to apply:',
  no_brand_voice_selected: 'Please select a brand voice',

  // Brand voice tone types
  voice_professional: 'Professional',
  voice_warm: 'Warm',
  voice_humorous: 'Humorous',
  voice_minimal: 'Minimal',
  voice_inspirational: 'Inspirational',

  // Profile editing
  edit_username: 'Edit Username',
  change_avatar: 'Change Avatar',
  username_placeholder: 'Enter name...',

  // Subscription pricing
  subscribe_monthly: '$6.99/month',
  subscribe_annual: '$49.99/year',
  best_value: 'Best Value',

  // In-App Purchase — IAP integration
  iap_not_available_title: 'Subscriptions Coming Soon',
  iap_not_available_desc: 'In-app subscriptions are not yet available in this version. You can continue using all features during your free trial. Subscriptions will be enabled in a future update.',
  purchase_failed_title: 'Purchase Failed',
  purchase_failed_desc: 'Your purchase could not be completed. Please try again later.',
  purchase_success_title: 'Purchase Successful',
  purchase_success_desc: 'Welcome to Pro! All features are now unlocked. Enjoy unlimited AI copy generation.',
  purchase_incomplete_title: 'Purchase Not Completed',
  purchase_incomplete_desc: 'The payment flow returned, but Apple did not confirm a completed purchase, so Pro was not unlocked. If you were already charged, tap "Restore Purchases"; otherwise please try again.',
  purchase_no_account_title: 'Cannot Reach the App Store',
  purchase_no_account_desc: 'This device is not signed in to an App Store account, or the App Store cannot be reached. Go to Settings → App Store and sign in with your Apple ID, then try again.',
  restore_success_title: 'Purchases Restored',
  restore_success_desc: 'Your Pro subscription has been successfully restored.',
  restore_failed_title: 'Restore Failed',
  restore_failed_desc: 'No active subscription was found to restore. If you believe this is an error, please contact support.',
  restore_no_subscription: 'No active subscription found to restore',
  restore_failed_not_available: 'In-app purchases are not available in this environment (Expo Go).',
  restore_revoked_title: 'Updated to Free',
  restore_revoked_desc: 'Your Apple account has no active subscription — Pro access has been updated to Free.',
  got_it: 'Got it',
  subscribe_btn: 'Subscribe',
  subscribe_btn_loading: 'Processing...',
  restore_purchases: 'Restore Purchases',
  restore_purchases_loading: 'Restoring...',
  manage_subscription: 'Manage Subscription',
  manage_subscription_failed_title: 'Unable to open subscription management',
  manage_subscription_failed_desc: 'Please try again later. You can also manage it manually in Settings → Apple ID → Subscriptions.',
  pro_unlocked_title: 'Pro Unlocked',
  pro_unlocked_desc: 'Thank you for subscribing! All Pro features are now active.',

  // History retention notice (info icon on subscription page)
  history_info_title: 'History Storage',
  history_info_desc: 'Your history is stored locally on your device. All data will be cleared if you uninstall the app.',
  history_footer_note: 'History and user data are stored locally on your device only.',

  // Subscription — feature comparison row labels
  feat_ai_copy: 'AI Copy Generation',
  feat_voice_input: 'Voice Input',
  feat_brand_voice: 'Brand Voice',
  feat_cultural_check: 'Cultural Check',
  feat_history_retention: 'History Retention',
  feat_avatar_username: 'Avatar + Username',

  // Unsaved changes prompt
  unsaved_changes_title: 'Unsaved Changes',
  unsaved_changes_desc: 'Copy has been modified. Do you want to save?',
  dont_save: "Don't Save",
  save: 'Save',

  // Data storage notice
  data_storage_title: 'Your Data Stays on Your Device',
  data_storage_desc: 'Your data is stored locally on this device only. History, favorites, and settings are saved only on your phone. We do not upload or collect any of your data. Data will be lost if you uninstall the app, but you can restore your subscription status by logging in with your Apple ID.',
  data_storage_ok: 'I Understand',

  // Apple ID login
  sign_in_with_apple: 'Sign in with Apple',
  sign_out: 'Sign Out',
  apple_sign_in_failed: 'Sign in failed. Please try again.',
  apple_sign_in_required: 'Please sign in with Apple ID to continue.',
  apple_bound: 'Apple ID Connected',
  apple_manage_account: 'Manage Apple Account',
  apple_sign_out_confirm: 'Signing out will clear your local subscription status and Pro access. This does not delete your Apple account.',
  apple_id_subscribed: 'Apple ID (subscribed)',
  apple_id_label: 'Apple ID',
  plan_tag_pro: 'Pro subscribed',
  plan_tag_trial: 'Trial',
  plan_tag_free: 'Not subscribed',
  welcome_back: 'Welcome back!',

  // Login screen
  login_title: 'SocialPost AI',
  login_subtitle: 'Sign in to start creating',
  login_terms: 'By continuing, you agree to our Privacy Policy and Terms of Service.',

  // Trial reminder
  trial_remind_7_4: 'Your free trial has {days} days left. After it expires, you will be switched to the free version (3 generations per day). Upgrade to Pro to enjoy all features.',
  trial_remind_3_1: 'Your free trial has {days} days left. Please upgrade to Pro now to avoid limited functionality.',
  trial_remind_last_day: 'Your free trial expires today! Upgrade to Pro for just $6.99/month.',
  remind_later: 'Remind Me Later',

  // Permission tooltips
  pro_member_badge: 'Pro Member 👑',
  feature_locked_upgrade: 'This feature requires Pro. Upgrade to unlock.',
  upgrade_to_unlock: 'Upgrade to Unlock',
  locked: 'Locked',

  // Developer / Testing — quota reset (QA builds only)
  dev_reset_quota: 'Reset Test Quota',
  dev_reset_quota_desc: 'This resets your free generation count. For testing only.',
  dev_reset_today: 'Reset today\'s free count',
  dev_reset_trial: 'Restore 7-day trial',
  dev_reset_done: 'Reset complete — you can start testing now.',
  diag_open: 'Diagnostics',
  diag_title: '🩺 Diagnostics',
};

export default en;
