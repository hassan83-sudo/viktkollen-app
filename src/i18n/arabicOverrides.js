import { smartCameraHubAr } from './smartCameraHubResources.js'

// Reviewed Arabic copy for the main navigation, home screen and account controls.
export const arabicOverrides = {
  common: {
    importModeDialog: { title: 'استيراد نسخة احتياطية', legend: 'كيف تريد استيراد البيانات؟', merge: 'دمجها مع البيانات الحالية', replace: 'استبدال البيانات الحالية', confirm: 'استيراد' },
    noteDialog: { title: 'تعديل الملاحظة', label: 'ملاحظة' },
    dateTimeDialog: { date: 'التاريخ', time: 'الوقت', hint: 'أدخل التاريخ بالصيغة YYYY-MM-DD والوقت بالصيغة HH:MM.', invalidDate: 'أدخل تاريخًا صالحًا بالصيغة YYYY-MM-DD.', invalidTime: 'أدخل وقتًا صالحًا بالصيغة HH:MM.' },
    actions: { cancel: 'إلغاء', close: 'إغلاق', loading: 'جارٍ التحميل…', open: 'فتح', save: 'حفظ', saveAndContinue: 'حفظ ومتابعة', signOut: 'تسجيل الخروج', skipForNow: 'التخطي الآن' },
    states: { missingData: 'لا توجد بيانات', noneYet: 'لا توجد بيانات بعد' },
    units: { days_one: '{{count}} يوم', days_other: '{{count}} يوم' },
  },
  navigation: {
    mainNavigation: 'التنقل الرئيسي', skipToContent: 'الانتقال إلى المحتوى الرئيسي',
    sections: {
      coach: { aria: 'فتح المدرب والنصائح', label: 'المدرب' }, home: { aria: 'فتح الصفحة الرئيسية', label: 'الرئيسية' },
      journey: { aria: 'فتح رحلتي', label: 'رحلتي' }, more: { aria: 'فتح المزيد من الميزات والإعدادات', label: 'المزيد' },
      nutrition: { aria: 'فتح الطعام والتغذية', label: 'الطعام' }, notices: { aria: 'فتح التنبيهات ودعم الذاكرة', label: 'التنبيهات' },
      place: { aria: 'فتح الموقع', label: 'الموقع' }, progress: { aria: 'فتح الوزن والتقدم', label: 'التقدم' },
      redo: { aria: 'فتح جاهز!', label: 'جاهز!' }, social: { aria: 'فتح الملتقى', label: 'الملتقى' },
    },
  },
  home: {
    smartCameraHub: smartCameraHubAr,
    actionDescriptions: { body: 'تابع تغيرات جسمك مع الوقت', ear: 'استمع إلى ما ينقصك', coach: 'نصائح شخصية بناءً على بياناتك', food: 'امسح الطعام وقدّر قيمته الغذائية', smartCamera: 'الذاكرة والملابس والمراجعة الأخيرة' },
    labels: { aiCoach: 'مدرب الذكاء الاصطناعي', aiEyes: 'عيون الذكاء الاصطناعي', bodyScan: 'مسح الجسم', calories: 'السعرات الحرارية', healthScore: 'مؤشر الصحة', home: 'الرئيسية', openAiCoach: 'فتح مدرب الذكاء الاصطناعي', openAiEyes: 'فتح عيون الذكاء الاصطناعي', proteinToday: 'بروتين اليوم', smartCameraSupport: 'الذاكرة والملابس والمراجعة الأخيرة', stepsToday: 'خطوات اليوم', today: 'اليوم', weight: 'الوزن', viktkollenLive: 'Viktkollen مباشر' },
    states: { noWeight: 'لم يُسجّل وزن', notConnected: 'غير متصل', registerWeight: 'تسجيل الوزن' },
    moreForToday: 'المزيد لهذا اليوم', logFood: 'تسجيل الطعام', personalAdvice: 'نصائح شخصية', fromYourData: 'من بياناتك، وليس من محادثات الأصدقاء', registerWeightLogged: 'تم تسجيل الوزن', weightTrendAria: 'اتجاه الوزن وفقًا لآخر السجلات',
    live: { pause: 'إيقاف Viktkollen مباشر مؤقتًا', play: 'تشغيل Viktkollen مباشر', previous: 'عرض البطاقة السابقة', next: 'عرض البطاقة التالية', controls: 'التحكم في Viktkollen مباشر' },
    weatherNotConnected: 'الطقس غير متصل', connectWeather: 'ربط الطقس', online: 'متصل', offline: 'غير متصل', tapImage: 'اضغط على الصورة', bodyCardHint: 'يفتح المسح مع دليل صوتي', cardActions: { openCamera: 'فتح الكاميرا', scanFood: 'مسح الطعام' },
    mood: { chat: 'الدردشة', openChat: 'فتح الدردشة', chatHint: 'تحدث مع الأصدقاء', wellbeing: 'الصحة النفسية', openWellbeing: 'فتح قسم الصحة النفسية', wellbeingQuestion: 'كيف تشعر اليوم؟', wellbeingHint: 'دعم اختياري دون عرض مشاعرك هنا', askCoach: 'اسأل مدربك', writeOrTalk: 'اكتب أو تحدث', openCoach: 'فتح المدرب', nextReminder: 'التذكير التالي', noReminder: 'لا توجد تذكيرات', reminderReady: 'التذكير التالي', openNotices: 'فتح', openLink: 'فتح', notices: 'التنبيهات', noticesCount: '{{count}} تنبيهات', noNotices: 'لا توجد تنبيهات', openNoticesCard: 'فتح التنبيهات' },
    weatherDay: { title: 'طقس اليوم', close: 'إغلاق', viewFullDay: 'عرض اليوم كاملًا', hourlyAria: 'الطقس ساعة بساعة', noHourly: 'لا تتوفر توقعات بالساعة الآن.', updated: 'آخر تحديث {{time}}', source: 'المصدر: {{source}}', uv: 'الأشعة فوق البنفسجية {{value}}', fallbackCity: 'موقعك' },
    todayMood: 'حالتك اليوم', glowBrightnessAria: 'سطوع حلقة النيون', glowBrightness: 'السطوع', glowLow: 'منخفض', glowNormal: 'عادي', glowStrong: 'قوي', glowExtra: 'قوي جدًا', chooseFoodImageAria: 'اختر صورة طعام من معرض الصور', estimateNutrition: 'تقدير القيمة الغذائية', tapIconBelow: 'اضغط على الأيقونة أدناه', chooseImage: 'اختيار صورة',
    quickShortcuts: { title: 'إجراءات سريعة', timer: 'المؤقت', alarm: 'المنبّه', reminder: 'تذكير', bathroom: 'الحمّام', allNotices: 'كل التنبيهات', actions: 'اختصارات مهمة', place: 'الموقع', openPlace: 'فتح الموقع' },
    checklists: { title: 'قوائم التحقق', description: 'أنشئ قوائم التحقق وافتحها' }, adviceAndNotices: 'النصائح والتنبيهات', sectionLabel: 'الرئيسية والنظرة العامة', overviewError: 'تعذّر عرض النظرة العامة', liveMetaAria: 'التاريخ والوقت والطقس', myLocation: 'موقعي', fetchingWeather: 'جارٍ جلب الطقس…', weatherUpdated: 'تم تحديث الطقس.', weatherFetchFailed: 'تعذّر جلب الطقس. حاول مرة أخرى.', proteinPick: 'مصادر البروتين', proteinSourcesAria: 'مصادر جيدة للبروتين', proteinFoods: { chicken: 'دجاج', beef: 'لحم بقري', egg: 'بيض' }, proteinGoalLabel: 'الهدف {{grams}} غ', compactStatsAria: 'ملخص الإحصاءات اليومية', checkInTitle: 'تسجيل اليوم', checkInHint: 'الطاقة والخطوات والمزاج والحركة', mealPlanTitle: 'خطة وجبات اليوم', last7Days: 'آخر 7 أيام', achievementsTitle: 'الإنجازات', healthPredictionTitle: 'التوقعات الصحية', dailyAdviceTitle: 'نصيحة اليوم', startAria: 'بدء', showSmartNotices: 'عرض التنبيهات الذكية', openProfileSettings: 'فتح إعدادات الملف الشخصي', addProfilePhoto: 'إضافة صورة للملف الشخصي', openBodyScanFullscreen: 'فتح مسح الجسم بملء الشاشة', readIngredients: 'قراءة المكونات', scanBodyWithCamera: 'مسح الجسم بالكاميرا', scanFoodWithCamera: 'مسح الطعام بالكاميرا',
    actionAlts: { coach: 'روبوت مدرب Viktkollen بالذكاء الاصطناعي', eyes: 'الكاميرا الذكية وعيون الذكاء الاصطناعي', body: 'مسح الجسم باستخدام واجهة الذكاء الاصطناعي', food: 'مسح وجبة بالذكاء الاصطناعي' },
    coachAdviceProtein: 'الآن: وصلت إلى {{percent}}٪ من هدف البروتين. قد يساعدك الدجاج أو اللحم البقري أو البيض على التقدم.', coachAdviceDefault: 'يستخدم المدرب أهدافك ووجباتك وعاداتك لاقتراح خطوة تالية واضحة.',
  },
  settings: {
    language: { description: 'غيّر اللغة فورًا دون إعادة تحميل التطبيق. اللغة السويدية هي اللغة الأصلية.', help: 'تُحفظ اللغة المختارة في الملف الشخصي عند توفره، وإلا تُحفظ محليًا في المتصفح.', label: 'اللغة', title: 'اللغة' },
    accountEyebrow: 'الحساب', accountTitle: 'الملف الشخصي والحساب', signedInAs: 'مسجّل الدخول باسم', unknownEmail: 'البريد الإلكتروني غير معروف', profileBasis: 'بيانات الملف الشخصي', unnamedProfile: 'ملف شخصي بلا اسم', goalMissing: 'لم يُحدّد الهدف', activityMissing: 'لم يُحدّد النشاط', profileAnytime: 'يمكنك إكمال ملفك الشخصي في أي وقت.', remoteImageAnalysis: 'تحليل الصور عن بُعد', remoteGrantedSince: 'تمت الموافقة لهذا المستخدم منذ {{date}}.', remoteNotGranted: 'لم تتم الموافقة على تحليل الصور عن بُعد لهذا المستخدم.', revokeConsent: 'سحب الموافقة على تحليل الصور', appSettingsDevices: 'إعدادات التطبيق والأجهزة', thisDevice: 'هذا الجهاز', localOnly: 'التخزين المحلي: تُحفظ البيانات على هذا الجهاز فقط.', localAndCloud: 'التخزين المحلي: تُحفظ البيانات هنا وتُزامَن مع السحابة عند تسجيل الدخول.', searchInApp: 'البحث في التطبيق', usageToggle: 'إظهار أو إخفاء الاشتراك والاستخدام', editProfile: 'تعديل الملف الشخصي', signingOut: 'جارٍ تسجيل الخروج…', aboutTitle: 'عن Viktkollen', aboutBody: 'يوفر Viktkollen دعمًا عامًا للصحة والعافية. المعلومات ليست نصيحة طبية أو تشخيصًا أو علاجًا.',
    search: { open: 'فتح البحث الشامل', dialog: 'البحث الشامل', input: 'البحث في Viktkollen', placeholder: 'البحث في Viktkollen…', results: 'نتائج البحث', noExactMatches: 'لا توجد نتائج مطابقة تمامًا لـ «{{query}}». إليك بعض البدائل.', resultCount_one: 'عدد النتائج: {{count}}', resultCount_other: 'عدد النتائج: {{count}}', groups: { popular: 'شائع', quickActions: 'إجراءات سريعة', suggestions: 'اقتراحات لك', recent: 'استُخدم مؤخرًا' } },
  },
  onboarding: {
    title: 'أنشئ ملفك الشخصي', welcome: 'مرحبًا بك في Viktkollen', copy: 'أجب عن بعض الأسئلة السريعة أو تخطَّ ما تريد إكماله لاحقًا. يُستخدم الملف الشخصي فقط لتقديم أهداف ونصائح وسياق أكثر ملاءمة للمسح.', canChangeLater: 'يمكن تغييره لاحقًا',
    fields: { name: 'الاسم', goal: 'ما الذي تريد تحقيقه؟', startWeight: 'الوزن عند البداية', goalWeight: 'الوزن المستهدف', height: 'الطول', activityLevel: 'مستوى النشاط', dietaryPreference: 'النظام الغذائي المفضل', avoidances: 'الأطعمة التي تتجنبها' },
    placeholders: { name: 'اسمك', startWeight: 'مثلًا 91.8', goalWeight: 'مثلًا 84.0', height: 'مثلًا 178', avoidances: 'مثلًا الفول السوداني أو لحم الخنزير' },
    dietary: { omnivore: 'نظام متنوع', vegetarian: 'نباتي', vegan: 'نباتي صرف', pescatarian: 'نباتي مع السمك', custom: 'مخصص' },
  },
  nutrition: { scanProgress: 'تقدم التحليل التقديري: {{progress}} بالمئة', consentDisplay: { change: 'تغيير تفضيل العرض', legend: 'طلب الموافقة على تحليل الذكاء الاصطناعي', always: 'السؤال في كل مرة', never: 'عدم السؤال مجددًا' }, uncertainDetails: 'بيانات غير مؤكدة' },
  aiEar: { title: 'أذن الذكاء الاصطناعي', intro: 'سجّل صوتًا أو اختر ملفًا صوتيًا. تحاول أذن الذكاء الاصطناعي تحديد ما إذا كان الصوت لطائر أو كلامًا أو موسيقى أو شيئًا آخر.', record: 'تسجيل', chooseFile: 'اختيار ملف صوتي', recordingStatus: 'الميكروفون يعمل. جارٍ التسجيل.', recordingProgress: 'الميكروفون يعمل – {{seconds}} ثانية من {{max}} ثانية', stopRecording: 'إيقاف التسجيل', preparing: 'جارٍ تجهيز الصوت…', ready: 'التسجيل جاهز.', readyTruncated: 'التسجيل جاهز، وسيُحلَّل أول {{max}} ثانية.', privacy: 'عند الضغط على تحليل، يُرسل هذا الصوت فقط إلى خادم Viktkollen لتحليله. لا يُحفَظ الصوت ولا يُحوَّل الكلام إلى نص.', analyze: 'تحليل الصوت', newRecording: 'تسجيل جديد', analyzing: 'أذن الذكاء الاصطناعي تستمع… قد تستغرق المرة الأولى حتى نصف دقيقة.', cancel: 'إلغاء', retry: 'حاول مرة أخرى', footer: 'أذن الذكاء الاصطناعي نموذج تجريبي. النتيجة استرشادية وليست ضمانًا.' },
  bodyScan: { aiEstimateNote: 'القياسات المقدّرة بالذكاء الاصطناعي تقريبية وليست قياسات طبية دقيقة.', safetyFallback: 'تحليل الصورة تقدير بصري وليس قياسًا طبيًا.', smartCameraNote: 'الكاميرا الذكية قسم منفصل للذاكرة والملابس والمراجعة الأخيرة. تبقى المعاينة المباشرة على جهازك، ولا يوجد تسجيل خفي.', chooseImageAria: 'اختيار صورة {{label}} لتحليل الجسم بالذكاء الاصطناعي' },
}
