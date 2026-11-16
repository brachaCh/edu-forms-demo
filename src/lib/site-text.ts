import { formatUploadLimitLabel } from "@/lib/upload-guard";

export interface SiteTexts {
  appName: string;
  appTagline: string;

  landing: {
    title: string;
    subtitle: string;
    loginButton: string;
    guestButton: string;
    guestSignupTitle: string;
    guestSignupSubtitle: string;
    guestIntroBody: string;
    guestIntroContinue: string;
    guestEmailLabel: string;
    guestEmailInvalid: string;
    guestEmailSendFailed: string;
    guestEnterFailed: string;
    guestSignupSubmit: string;
    guestSignupSubmitting: string;
    guestWelcomeTitle: string;
    guestWelcomeBody: string;
    guestWelcomeConfirm: string;
    guestWaiverNotice: string;
    guestExpiredTitle: string;
    guestExpiredBody: string;
    guestExpiredConfirm: string;
    guestUsedUp: string;
    accessibilityLink: string;
    termsOfUseLink: string;
    privacyLink: string;
    termsLink: string;
    tutorialsLink: string;
  };

  dashboard: {
    title: string;
    subtitle: string;
    schools: string;
    highSchools: string;
    kindergartens: string;
    tutorials: string;
    personalArea: string;
    summary: string;
    contactLink: string;
  };

  contact: {
    title: string;
    subtitle: string;
    nameLabel: string;
    emailLabel: string;
    subjectLabel: string;
    messageLabel: string;
    sendButton: string;
    sending: string;
    success: string;
    error: string;
  };

  personalArea: {
    title: string;
    subtitle: string;
    categoryTableTitle: string;
    studentListTitlePrefix: string;
    studentCardTitle: string;
    staffCardTitle: string;
    addStudent: string;
    logout: string;
    managePersonalArea: string;
    backToProfile: string;
    guestMessage: string;
    recordsLabel: string;
    backToTable: string;
    backToSectors: string;
    backToFrameworks: string;
    backToList: string;
    chooseFrameworkSubtitle: string;
    chooseSectorSubtitle: string;
    sectorKindergartens: string;
    sectorHighSchools: string;
    sectorSchools: string;
    comingSoonTitle: string;
    comingSoonContactNotice: string;
    regularFramework: string;
    specialFramework: string;
    emptyList: string;
    loading: string;
    hello: string;
    institutionCode: string;
    institutionName: string;
    schoolName: string;
    institutionLogoLabel: string;
    institutionLogoHint: string;
    institutionLogoPurchaseHint: string;
    institutionLogoUpload: string;
    institutionLogoRemove: string;
    institutionLogoEmpty: string;
    institutionLogoAlt: string;
    institutionLogoTooLarge: string;
    institutionLogoNotImage: string;
    institutionLogoError: string;
    documentLogosTitle: string;
    documentLogosHint: string;
    aiExamplesTitle: string;
    aiExamplesHint: string;
    aiExamplesKindLabel: string;
    aiExamplesUpload: string;
    aiExamplesEmpty: string;
    aiExamplesSaved: string;
    aiExamplesRemove: string;
    aiExamplesRemoveFailed: string;
    registerLink: string;
    studentsTitle: string;
    studentsSubtitle: string;
    studentsSearchPlaceholder: string;
    staffSearchPlaceholder: string;
    searchSelectAll: string;
    summaryTitle: string;
    summarySubtitle: string;
    newStudentSubtitle: string;
    editStudentSubtitle: string;
    backToStudentsList: string;
    importExcel: string;
    importExcelTitle: string;
    importExcelDescription: string;
    importExcelSpecialEdDescription: string;
    importExcelSpecialEdColumns: string;
    importExcelIntegrationColumns: string;
    importExcelPersonalBasketDescription: string;
    importExcelPersonalBasketColumns: string;
    importExcelFrequencyHigh: string;
    importExcelFrequencyLow: string;
    importExcelFrequencyUnknown: string;
    importExcelDownloadSample: string;
    importExcelNoticeTitle: string;
    importExcelNoticeMissing: string;
    importExcelNoticeUnknown: string;
    importExcelChooseFile: string;
    importExcelPreview: string;
    importExcelConfirm: string;
    importExcelImporting: string;
    importExcelNoRows: string;
    importExcelParseError: string;
    importExcelMissingName: string;
    importExcelIdNumberOtherStatus: string;
    importExcelDuplicate: string;
    importExcelDuplicateInFile: string;
    importExcelUpdate: string;
    importExcelOk: string;
    importExcelSummary: string;
    importExcelSummaryFull: string;
    importExcelClassNameLabel: string;
    importExcelClose: string;
    importExcelOwnerAssignsTeacher: string;
    scheduleImportExcel: string;
    scheduleImportHint: string;
    scheduleImportOk: string;
    scheduleImportEmpty: string;
    midYearIntakeButton: string;
    midYearIntakeChooseTitle: string;
    midYearIntakeChooseDescription: string;
    midYearIntakeChooseFrequency: string;
    midYearIntakeContinue: string;
    midYearIntakeListTitle: string;
    midYearIntakeTransferConfirm: string;
    studentsArchiveButton: string;
    studentsArchiveTitle: string;
    studentsArchiveSubtitle: string;
    studentsArchiveEmpty: string;
    studentsArchiveHint: string;
    studentsArchiveRestore: string;
    studentsArchiveRestoreBusy: string;
    studentsArchiveRestoreError: string;
    studentsArchiveOpenCard: string;
    studentsArchiveOpenPortfolio: string;
    studentsArchiveDateLabel: string;
    integrationRenewalAlertTitle: string;
    integrationRenewalAlertHint: string;
    integrationRenewalBadge: string;
    integrationRenewalOverdueBadge: string;
  };

  status: {
    integration: string;
    personalBasket: string;
    specialEdClass: string;
    integrationTeacher: string;
    integrationListTitle: string;
    personalBasketListTitle: string;
    specialEdClassListTitle: string;
    /** כותרת רשימת תלמידים בתוך «תיק תלמיד כיתה» — נפרד מרשימת הכיתות */
    specialEdStudentListTitle: string;
    integrationTeacherListTitle: string;
    frequencyListTitle: string;
    frequencyHigh: string;
    frequencyLow: string;
    frequencyHighListTitle: string;
    frequencyLowListTitle: string;
    backToFrequencies: string;
    specialEdModeListTitle: string;
    specialEdModeListSubtitle: string;
    specialEdExcelImportRecommended: string;
    specialEdOrManualEntry: string;
    specialEdModeStudent: string;
    specialEdModeStudentHint: string;
    specialEdModeCurriculum: string;
    specialEdModeCurriculumHint: string;
    specialEdModeBackToModes: string;
    specialEdModeBackToTeachers: string;
    specialFrameworkStaff: string;
    specialFrameworkClass: string;
    specialFrameworkClassHint: string;
    specialEdClassAdd: string;
    specialEdClassAddTitle: string;
    specialEdClassNameLabel: string;
    specialEdClassNameRequired: string;
    specialEdClassBackToList: string;
    specialEdClassEmpty: string;
    specialEdClassDeleteTitle: string;
    specialEdClassDeleteEmptyDescription: string;
    specialEdClassDeleteWithStudentsDescription: string;
    specialEdClassDeleteConfirm: string;
    specialEdClassDeleteBusy: string;
    specialEdClassDeleteError: string;
    specialEdClassArchiveTitle: string;
    specialEdClassArchiveDescription: string;
    specialEdClassArchiveConfirm: string;
    specialEdClassArchiveBusy: string;
    specialEdClassArchiveError: string;
    specialEdHomeroomTitle: string;
    specialEdHomeroomNameLabel: string;
    specialEdHomeroomEmailLabel: string;
    specialEdHomeroomSendLink: string;
    specialEdHomeroomSending: string;
    specialEdHomeroomNameRequired: string;
    specialEdHomeroomEmailInvalid: string;
    specialEdHomeroomReassignTitle: string;
    specialEdHomeroomReassignDescription: string;
    specialEdHomeroomReassignConfirm: string;
    specialEdHomeroomReassignCancel: string;
    teachersListTitle: string;
    teachersEmptyList: string;
    backToTeachers: string;
    /** חזרה לרוסטר אנשי צוות — נפרד מ«חזרה לרשימת התלמידים» */
    backToStaffList: string;
    addTeacher: string;
    addTeacherPlaceholder: string;
    addStaffCard: string;
    teachersRosterTab: string;
    teachersRosterTitle: string;
    teacherStudentsHeading: string;
  };

  categories: {
    schools: string;
    highSchools: string;
    kindergartens: string;
    tutorials: string;
    schoolsSubtitle: string;
    highSchoolsSubtitle: string;
    kindergartensSubtitle: string;
    tutorialsSubtitle: string;
  };

  categoryDetail: {
    backToDashboard: string;
    inDevelopment: string;
    promptPersonalArea: string;
    manageStudents: string;
    summaryTable: string;
  };

  tutorials: {
    item1Title: string;
    item1Description: string;
    item2Title: string;
    item2Description: string;
    item3Title: string;
    item3Description: string;
    item4Title: string;
    item4Description: string;
    comingSoon: string;
    emptyList: string;
    deleteTitle: string;
    deleteConfirm: string;
    addButton: string;
    addTitle: string;
    addDescription: string;
    titleLabel: string;
    descriptionLabel: string;
    urlLabel: string;
    attachUrl: string;
    attachUrlTitle: string;
    attachUrlDescription: string;
    saveUrl: string;
    uploadVideo: string;
    removeVideo: string;
  };

  studentFields: {
    name: string;
    firstName: string;
    lastName: string;
    phone: string;
    father: string;
    mother: string;
    className: string;
    teacher: string;
    responsibleTeacher: string;
    homeroomTeacher: string;
    educationSupport: string;
    role: string;
    characterization: string;
    familyStatus: string;
    singleResponsibleParty: string;
    singleResponsiblePartyYes: string;
    singleResponsiblePartyNo: string;
    integrationStartDate: string;
    eligibilityCommitteeDate: string;
    additionalTreatments: string;
    parentsEmail: string;
    notes: string;
    calendarYear: string;
    integrationFrequency: string;
    frequencyHigh: string;
    frequencyLow: string;
    idNumber: string;
    birthDate: string;
    gender: string;
    homeAddress: string;
    city: string;
    fatherMobile: string;
    fatherEmail: string;
    motherMobile: string;
    motherEmail: string;
    email: string;
  };

  studentDocuments: {
    title: string;
    uploadButton: string;
    uploadHint: string;
    emptyList: string;
    deleteButton: string;
    fileTooLarge: string;
    uploading: string;
    folderLabel: string;
    uploadFolderLabel: string;
    addFolderButton: string;
    newFolderPlaceholder: string;
    saveFolderButton: string;
    activeTitle: string;
    archiveTitle: string;
    archiveHint: string;
    archiveEmpty: string;
    archiveButton: string;
    restoreButton: string;
    openButton: string;
    downloadButton: string;
    archiveByYearTitle: string;
    archiveYearLabel: string;
    moveToFolderButton: string;
    moveToFolderTitle: string;
    moveToFolderConfirm: string;
    restoreToFolderTitle: string;
    restoreToFolderConfirm: string;
    moveSuccess: string;
    currentFolderLabel: string;
  };

  studentPortfolio: {
    title: string;
    subtitle: string;
    backToPortfolio: string;
    backToCard: string;
    goToPortfolio: string;
    addFolderButton: string;
    newFolderPlaceholder: string;
    saveFolderButton: string;
    removeFolderButton: string;
    removeFolderConfirm: string;
    removeFolderBlocked: string;
    addActionButton: string;
    fillDocument: string;
    independentUpload: string;
    uploadFillDocument: string;
    uploadIndependent: string;
    fillEmpty: string;
    addNamedDocument: string;
    namedDocumentPlaceholder: string;
    backToFolder: string;
    formsPageSubtitle: string;
    filledFormsListTitle: string;
    filledFormsListEmpty: string;
    allFormsTitle: string;
    formsEmpty: string;
    fillFormHint: string;
    saveDraft: string;
    saveAndSnapshot: string;
    saveArchiveAndPrint: string;
    saveForm: string;
    printForm: string;
    printBlockedFreeAccess: string;
    goToNextForm: string;
    goToNextFolder: string;
    schoolLogoLabel: string;
    schoolLogoUpload: string;
    schoolLogoRemove: string;
    schoolLogoEmpty: string;
    schoolLogoAlt: string;
    schoolLogoHint: string;
    schoolLogoTooLarge: string;
    schoolLogoNotImage: string;
    schoolLogoError: string;
    greenSignatureTypeMode: string;
    greenSignatureDrawMode: string;
    greenSignatureWhatIs: string;
    greenSignatureExplainTitle: string;
    greenSignatureExplainBody: string;
    greenSignatureClear: string;
    greenSignatureSave: string;
    greenSignatureSaved: string;
    greenSignatureHint: string;
    parentSignatureLockedHint: string;
    parentSignatureReceivedHint: string;
    thirdPartySignatureLockedHint: string;
    thirdPartySignatureReceivedHint: string;
    openFillForm: string;
    sendParentQuestionnaire: string;
    openParentQuestionnaireReturned: string;
    openParentQuestionnaireTlaReturned: string;
    noStructuredForm: string;
    waiverRequiredTitle: string;
    waiverRequiredDescription: string;
    waiverBothParentsRequiredTitle: string;
    waiverBothParentsRequiredDescription: string;
    waiverNextFormBlocked: string;
    waiverRequiredGoFill: string;
    waiverRequiredClose: string;
    waiverUploadDoesNotUnlock: string;
    paperWaiverTitle: string;
    paperWaiverDescription: string;
    paperWaiverUpload: string;
    paperWaiverReplace: string;
    paperWaiverRemove: string;
    paperWaiverView: string;
    paperWaiverSatisfied: string;
    paperWaiverDigitalSatisfied: string;
    paperWaiverBothSatisfied: string;
    paperWaiverPendingDigitalNote: string;
    paperWaiverTypeError: string;
    paperWaiverUploading: string;
    paperWaiverUploadedAt: string;
    paperWaiverRemoved: string;
    paperWaiverRemoveFailed: string;
    paperWaiverRemoving: string;
    paperWaiverRestoreBlocked: string;
    paperWaiverArchiveDeleteBlocked: string;
    paperWaiverUseArchiveOp: string;
    printFolder: string;
    printFolderEmpty: string;
    printSelected: string;
    printSelectedEmpty: string;
    selectFoldersHint: string;
    clearFolderSelection: string;
    catGeneralInfo: string;
    catDiagnoses: string;
    catHearingVision: string;
    catLearningProcess: string;
    catTherapy: string;
    catClassCurriculum: string;
    catTla: string;
    catInclusion: string;
    catTherapeuticIntegration: string;
    catTherapeuticInteraction: string;
    catAchievements: string;
    catSpecialEdAchievements: string;
    catExtraDocuments: string;
  };

  voiceRecorder: {
    startRecording: string;
    stopRecording: string;
    refining: string;
    slogan: string;
    promoTitle: string;
    promoSubtitle: string;
    aiUnavailable: string;
    aiUnauthorized: string;
    aiRateLimited: string;
    aiTimeout: string;
    browserUnsupported: string;
    noSpeech: string;
    micNotAllowed: string;
    micMissing: string;
    genericError: string;
    refineTyped: string;
    refineTypedUnavailable: string;
    refineTypedFailed: string;
    refineTypedTimeout: string;
    refineTypedEmpty: string;
    refineTypedChanged: string;
    refineTooLong: string;
  };

  formAiFill: {
    title: string;
    subtitle: string;
    prepSubtitle: string;
    prepHowTitle: string;
    prepStep1: string;
    prepStep2: string;
    prepNotesLabel: string;
    prepNotesVoiceHint: string;
    prepNotesPlaceholder: string;
    prepNotesRequired: string;
    prepButton: string;
    tachiSubtitle: string;
    tachiHowTitle: string;
    tachiStep1: string;
    tachiStep2: string;
    tachiStep3: string;
    tachiNotesPlaceholder: string;
    tachiButton: string;
    tachiIntegrativeSubtitle: string;
    tachiIntegrativeHowTitle: string;
    tachiIntegrativeStep1: string;
    tachiIntegrativeStep2: string;
    tachiIntegrativeNotesPlaceholder: string;
    tachiIntegrativeButton: string;
    notesLabel: string;
    notesVoiceHint: string;
    refineFollowUpHint: string;
    notesPlaceholder: string;
    exampleLabel: string;
    exampleHint: string;
    exampleSharedLabel: string;
    exampleSharedHint: string;
    exampleSharedNone: string;
    exampleSharedSelect: string;
    examplePersonalOverride: string;
    exampleUpload: string;
    exampleReading: string;
    exampleEmpty: string;
    exampleReadFailed: string;
    exampleTooLarge: string;
    exampleUnsupported: string;
    exampleDocLegacy: string;
    button: string;
    loading: string;
    disclaimer: string;
    success: string;
    emptyResult: string;
    unauthorized: string;
    rateLimited: string;
    unavailable: string;
    notAllowed: string;
    timeout: string;
    failed: string;
  };

  studentCustomFields: {
    title: string;
    addButton: string;
    emptyList: string;
    labelPlaceholder: string;
    valuePlaceholder: string;
    saveButton: string;
    deleteButton: string;
    addTitle: string;
    editTitle: string;
    labelRequired: string;
  };

  studentCard: {
    restoreFieldTitle: string;
    restoreFieldButton: string;
    deleteFieldConfirm: string;
    calendarYearLabel: string;
    calendarYearSave: string;
    calendarYearSaved: string;
    transferToPersonalBasket: string;
    transferToPersonalBasketTitle: string;
    transferToPersonalBasketDescription: string;
    transferToPersonalBasketConfirm: string;
    transferToPersonalBasketBusy: string;
    transferToPersonalBasketError: string;
    transferFrequencyLabel: string;
    archiveStudentFile: string;
    archiveStudentFileTitle: string;
    archiveStudentFileDescription: string;
    archiveStudentFileConfirm: string;
    archiveStudentFileBusy: string;
    archiveStudentFileError: string;
    restoreStudentFile: string;
    restoreStudentFileTitle: string;
    restoreStudentFileDescription: string;
    restoreStudentFileConfirm: string;
    restoreStudentFileBusy: string;
    restoreStudentFileError: string;
    archivedBanner: string;
    teacherInviteSend: string;
    teacherInviteTitle: string;
    teacherInviteDescription: string;
    teacherInviteConfirm: string;
    teacherInviteBusy: string;
    teacherInviteSuccess: string;
    teacherInviteError: string;
    teacherInviteNoEmail: string;
    teacherInviteAlreadyHasAccount: string;
    teacherInviteAlreadyLinked: string;
    teacherInviteNotStaff: string;
    teacherInviteRateLimited: string;
    teacherInviteUnauthorized: string;
    teacherInviteForbidden: string;
    teacherInviteClose: string;
  };

  auth: {
    step1Badge: string;
    step1Title: string;
    step1Subtitle: string;
    step2Badge: string;
    step2Title: string;
    step2Subtitle: string;
    nameLabel: string;
    phoneLabel: string;
    emailLabel: string;
    institutionCodeLabel: string;
    institutionNameLabel: string;
    schoolNameLabel: string;
    termsCheckbox: string;
    submitButton: string;
    continueButton: string;
    saveStepButton: string;
    saveAndContinue: string;
    savedSuccess: string;
    step1SummaryTitle: string;
    nameShort: string;
    phoneShort: string;
    emailShort: string;
    passwordLabel: string;
    confirmPasswordLabel: string;
    loginTitle: string;
    loginSubtitle: string;
    loginButton: string;
    otpSubtitle: string;
    otpSendButton: string;
    otpCodeLabel: string;
    otpVerifyButton: string;
    otpResend: string;
    otpChangeEmail: string;
    registerLink: string;
    noAccountPrompt: string;
    continuePendingRegistration: string;
    forgotLink: string;
    forgotTitle: string;
    forgotSubtitle: string;
    forgotSubmitButton: string;
    forgotSending: string;
    forgotSuccess: string;
    backToLogin: string;
    resetTitle: string;
    resetSubtitle: string;
    resetSubmitButton: string;
    resetMissingToken: string;
    resetSuccessBanner: string;
    inviteTitle: string;
    inviteSubtitle: string;
    inviteAccessNoticeTitle: string;
    inviteAccessNotice: string;
    inviteAccessNoticeClose: string;
    inviteMissingToken: string;
    inviteLoading: string;
    inviteSubmitButton: string;
    inviteStep1Label: string;
    inviteStep2Label: string;
    inviteStep3Label: string;
    inviteStep1Hint: string;
    inviteStep2Hint: string;
    inviteContinueButton: string;
    inviteSendOtpButton: string;
    inviteOtpHint: string;
    inviteVerifyButton: string;
    inviteRedirecting: string;
    inviteExistingLoginTitle: string;
    inviteExistingLoginHint: string;
    inviteResumedLoginHint: string;
    inviteExistingLoginButton: string;
    /** TZ-17: בורר מוסדות */
    selectInstitutionTitle: string;
    selectInstitutionSubtitle: string;
  };

  wizard: {
    step1Title: string;
    step1Subtitle: string;
    step1LongSubtitle: string;
    step2Title: string;
    step2Subtitle: string;
    step2HeaderTitle: string;
    step2LongSubtitle: string;
    step3Title: string;
    step3Subtitle: string;
    step3HeaderTitle: string;
    step3LongSubtitle: string;
    saveButton: string;
    saveChangesButton: string;
    saveStepButton: string;
    saveOnlyButton: string;
    continueToNext: string;
    saveAndContinue: string;
    savedSuccess: string;
    editButton: string;
    deleteButton: string;
    cancelButton: string;
    newStudentTitle: string;
    editStudentTitle: string;
    continueToCategory: string;
    continueToStatus: string;
    backToCard: string;
    backToCategory: string;
    noStatus: string;
    noStatusDescription: string;
    previewLabel: string;
    namePreview: string;
    categoryPreview: string;
    statusPreview: string;
    classNameOptional: string;
    teacherOptional: string;
    addNewTeacher: string;
    notesOptional: string;
    categoryHint: string;
    categoryHintSuffix: string;
    studentNameLabel: string;
    studentFirstNameLabel: string;
    studentLastNameLabel: string;
    staffCardTitle: string;
    staffCardSubtitle: string;
    staffNameLabel: string;
    staffSendInviteCheckbox: string;
    staffSendInviteNoEmailHint: string;
    staffInviteSentSuccess: string;
    fatherShort: string;
    motherShort: string;
    stepOf: string;
    stepOfTotal: string;
    schoolsDesc: string;
    highSchoolsDesc: string;
    kindergartensDesc: string;
    integrationDesc: string;
    personalBasketDesc: string;
    specialEdClassDesc: string;
    integrationTeacherDesc: string;
  };

  terms: {
    title: string;
    subtitle: string;
    section1Title: string;
    section1Body: string;
    section2Title: string;
    section2Body: string;
    section3Title: string;
    section3Body: string;
    section4Title: string;
    section4Body: string;
    section5Title: string;
    section5Body: string;
    section6Title: string;
    section6Body: string;
  };

  admin: {
    title: string;
    subtitle: string;
    editTextsTitle: string;
    editTextsDescription: string;
    saveTexts: string;
    resetTexts: string;
    textsSaved: string;
    logsTitle: string;
    logsSubtitle: string;
    logsNavTitle: string;
    logsNavDescription: string;
    logsFilterLabel: string;
    logsRefresh: string;
    logsLoading: string;
    logsEmpty: string;
    logsError: string;
    logsForbidden: string;
    logsColWhen: string;
    logsColAction: string;
    logsColUser: string;
    logsColSummary: string;
    logsPrev: string;
    logsNext: string;
  };

  billing: {
    title: string;
    subtitle: string;
    manageTitle: string;
    manageSubtitle: string;
    annualNote: string;
    planIncludesLabel: string;
    selectedBadge: string;
    priceNote: string;
    continueToPayment: string;
    saving: string;
    changePlan: string;
    changeFramework: string;
    currentPlanLabel: string;
    specialEducationCategory: string;
    kindergartenCategory: string;
    pendingPaymentTitle: string;
    pendingPaymentSubtitle: string;
    pendingPaymentRedirectNote: string;
    redirectingToPayment: string;
    paymentComingSoon: string;
    payNow: string;
    continueWithoutPayment: string;
    noPlansTitle: string;
    noPlansSubtitle: string;
    bankTransferHint: string;
    bankTransferContact: string;
    customPlanHint: string;
    customPlanStudentsLabel: string;
  };

  platform: {
    subscriptionsTitle: string;
    subscriptionsSubtitle: string;
    subscriptionsNav: string;
    activateBank: string;
    updatePlan: string;
    cancelSubscription: string;
    removeSubscription: string;
    billingPricesTitle: string;
    billingPricesSubtitle: string;
    billingPricesKindergartens: string;
    billingPricesSchools: string;
    billingPricesHighSchools: string;
    billingPricesClassLabel: string;
    billingPricesStudentLabel: string;
    billingPricesSave: string;
    billingPricesSaving: string;
  };

  common: {
    back: string;
    edit: string;
    delete: string;
    loading: string;
    notFound: string;
    footer: string;
    copyright: string;
    allRightsReserved: string;
  };

  /**
   * עותקי טקסט לפי מגזר — עריכה בדף של גנים לא תשנה בתי ספר / תיכונים.
   * המבנה נוצר תוך כדי שמירה (pageBySector.kindergartens.personalArea....).
   */
  pageBySector: {
    kindergartens: Record<string, unknown>;
    schools: Record<string, unknown>;
    "high-schools": Record<string, unknown>;
  };
}

export const DEFAULT_SITE_TEXTS: SiteTexts = {
  appName: "פרוטוקל",
  appTagline: "מערכת הטפסים החכמה",

  landing: {
    title: 'ברוכים הבאים ל"פרוטוקל"',
    subtitle: "מערכת הטפסים החכמה של החינוך המיוחד",
    loginButton: "כניסה לאזור האישי",
    guestButton: "כניסה חופשית",
    guestSignupTitle: "כניסה חופשית",
    guestSignupSubtitle: "הזינו כתובת מייל כדי להתחיל לנסות את המערכת",
    guestIntroBody:
      "מזמינים אתכם להצצה ראשונית והתנסות חינמית במערכת! לרשותכם 20 דקות של גישה חופשית כדי לבדוק ולהתנסות. להמשיך לצפייה?",
    guestIntroContinue: "להמשיך לצפייה",
    guestEmailLabel: "כתובת מייל",
    guestEmailInvalid: "נא להזין כתובת מייל תקינה",
    guestEmailSendFailed: "שליחת ההרשמה נכשלה — נסו שוב",
    guestEnterFailed: "לא ניתן לפתוח כרגע את הכניסה החופשית.",
    guestSignupSubmit: "המשך לכניסה חופשית",
    guestSignupSubmitting: "נרשמים...",
    guestWelcomeTitle: "נסה ותהני",
    guestWelcomeBody:
      "הכניסה החופשית פתוחה ל־20 הדקות הקרובות. אחרי כן הסשן ייסגר. בשימוש מלא נדרשות חתימות שני ההורים על ויתור הסודיות.",
    guestWelcomeConfirm: "יאללה, מתחילים",
    guestWaiverNotice:
      "בשימוש מלא נדרשות חתימות שני ההורים על טופס ויתור הסודיות.",
    guestExpiredTitle: "הזמן נגמר",
    guestExpiredBody:
      "זמן הכניסה החופשית הסתיים. להמשך שימוש יש להירשם למערכת.",
    guestExpiredConfirm: "חזרה לדף הבית",
    guestUsedUp: "כבר ניצלתם את 20 דקות הכניסה החופשית במכשיר זה.",
    accessibilityLink: "הצהרת נגישות",
    termsOfUseLink: "תקנון שימוש",
    privacyLink: "מדיניות פרטיות",
    termsLink: "תקנון האתר",
    tutorialsLink: "סרטוני הדרכה",
  },

  dashboard: {
    title: 'ברוכים הבאים ל"פרוטוקל"',
    subtitle: "בחרו קטגוריה",
    schools: "בתי ספר",
    highSchools: "תיכונים",
    kindergartens: "גני ילדים",
    tutorials: "סרטוני הדרכה",
    personalArea: "האזור האישי שלך",
    summary: "סיכום ורשימות",
    contactLink: "צרו קשר",
  },

  contact: {
    title: "צרו קשר",
    subtitle: "שלחו לנו הודעה ונחזור אליכם בהקדם",
    nameLabel: "שם מלא",
    emailLabel: "כתובת המייל שלכם",
    subjectLabel: "נושא",
    messageLabel: "הודעה",
    sendButton: "שליחת המייל",
    sending: "שולח...",
    success: "ההודעה נשלחה בהצלחה",
    error: "שליחת ההודעה נכשלה — נסו שוב",
  },

  personalArea: {
    title: "האזור האישי שלך",
    subtitle: "בחרו מגזר: גני ילדים, בתי ספר או תיכונים",
    categoryTableTitle: "טבלה / רשימה",
    studentListTitlePrefix: "רשימת תלמידי",
    studentCardTitle: "כרטיס התלמיד",
    staffCardTitle: "כרטיס איש צוות",
    addStudent: "הוספת תלמיד חדש",
    logout: "יציאה",
    managePersonalArea: "ניהול איזור אישי",
    backToProfile: "חזרה לפרופיל המוסד",
    guestMessage: "מצב אורח — ניתן לצפות ברשימות. להרשמה מלאה:",
    recordsLabel: "רשומות",
    backToTable: "חזרה לטבלה / רשימה",
    backToSectors: "חזרה לבחירת מגזר",
    backToFrameworks: "חזרה לבחירת מסגרת",
    backToList: "חזרה לרשימה",
    chooseFrameworkSubtitle: "בחרו סוג מסגרת חינוך",
    chooseSectorSubtitle: "בחרו מגזר: גני ילדים, בתי ספר או תיכונים",
    sectorKindergartens: "גני ילדים",
    sectorHighSchools: "תיכונים",
    sectorSchools: "בתי ספר",
    comingSoonTitle: "הקטגוריה בהרצה",
    comingSoonContactNotice:
      "השאירו פניה באתר וקבלו עדכון כשהיא תהיה זמינה.",
    regularFramework: "מסגרות חינוך רגיל",
    specialFramework: "מסגרות חינוך מיוחד",
    emptyList: "אין תלמידים ברשימה זו עדיין",
    loading: "טוען את האזור האישי...",
    hello: "שלום",
    institutionCode: "סמל מוסד",
    institutionName: "שם המוסד",
    schoolName: "שם בית הספר",
    institutionLogoLabel: "לוגו עמותה",
    institutionLogoHint:
      "בצד שמאל בראש המסמכים — לוגו כללי של העמותה. לוגו פרוטוקל נשאר בתחתית",
    institutionLogoPurchaseHint:
      "ניתן להעלות כאן לוגו עמותה שיופיע בצד שמאל בראש הטפסים",
    institutionLogoUpload: "העלאת לוגו עמותה",
    institutionLogoRemove: "הסרת לוגו",
    institutionLogoEmpty: "אין לוגו עמותה",
    institutionLogoAlt: "לוגו עמותה",
    institutionLogoTooLarge: "הלוגו גדול מדי (עד כ־800KB)",
    institutionLogoNotImage: "יש להעלות קובץ תמונה",
    institutionLogoError: "העלאת הלוגו נכשלה",
    documentLogosTitle: "לוגואים למסמכים",
    documentLogosHint:
      "שמאל: לוגו עמותה · ימין: לוגו בית ספר. לוגו פרוטוקל מופיע תמיד בתחתית",
    aiExamplesTitle: "דוגמאות למילוי AI",
    aiExamplesHint:
      "העלי דוגמת תח״י/תל״א ממולאת היטב — ה-AI ילמד ממנה סגנון, מבנה ורמת פירוט וימלא טוב יותר",
    aiExamplesKindLabel: "סוג טופס",
    aiExamplesUpload: "העלאת דוגמה ל-AI",
    aiExamplesEmpty: "עדיין אין דוגמה ל-AI — העלי דוגמת מילוי אחת",
    aiExamplesSaved: "הדוגמה נשמרה — ה-AI ישתמש בה למילוי טוב יותר",
    aiExamplesRemove: "מחיקה",
    aiExamplesRemoveFailed: "מחיקת הדוגמה נכשלה — נסי שוב",
    registerLink: "רישום לאזור האישי",
    studentsTitle: "ניהול תלמידים",
    studentsSubtitle: "רשימת התלמידים לכל הקטגוריות - בית ספר, תיכון וגן",
    studentsSearchPlaceholder: "חיפוש תלמיד",
    staffSearchPlaceholder: "חיפוש איש צוות",
    searchSelectAll: "",
    summaryTitle: "טבלת סיכום ורשימות",
    summarySubtitle:
      "תמונת מצב כוללת - כל התלמידים והמורות מחולקים לפי קטגוריה וסיווג",
    newStudentSubtitle:
      "הוספת תלמיד/ה בכרטיס אחד: מורה, פרטים אישיים וכיתה",
    editStudentSubtitle:
      "עדכון פרטי התלמיד/ה - השינויים יופיעו מיד ברשימות ובטבלת הסיכום",
    backToStudentsList: "חזרה לרשימת התלמידים",
    importExcel: "ייבוא מאקסל",
    importExcelTitle: "ייבוא תלמידים ישנים מאקסל",
    importExcelDescription:
      "העלו קובץ אקסל קיים עם נתוני תלמידים מהמערכת הישנה. התלמידים יתווספו לרשימה הנוכחית.",
    importExcelSpecialEdDescription:
      "העלו קובץ אקסל עם רשימת תלמידי הכיתה (כיתות חינוך מיוחד / מסגרות חינוך מיוחד). אפשר להוריד קובץ דוגמה ולהשלים את השורות.",
    importExcelSpecialEdColumns:
      "לקובץ הדוגמה יש את העמודות: שם משפחה, שם פרטי, ת.ז., ת. לידה, כתה, ז/נ, כתובת, ישוב, שם האב, נייד אב, מייל אבא, שם האם, נייד אם, מייל אמא, מחנכת, אפיון, תיאור תפקוד, תאריך כניסה לשילוב, מייל הורים, מצב משפחתי, אחראי יחיד, תאריך וועדת אפיון וזכאות, טיפולים נוספים, הערות, שנה קלנדרית.",
    importExcelIntegrationColumns:
      "לקובץ הדוגמה יש את העמודות: שם משפחה, שם פרטי, ת.ז., ת. לידה, כתה, ז/נ, כתובת, ישוב, שם האב, נייד אב, מייל אבא, שם האם, נייד אם, מייל אמא, מייל הורים, מורה אחראית, תאריך כניסה לשילוב, מצב משפחתי, אחראי יחיד, מחנכת, טיפולים נוספים, הערות, שנה קלנדרית.",
    importExcelPersonalBasketDescription:
      "העלו קובץ אקסל עם רשימת תלמידי סל אישי. עמודת «שכיחות» תחלק אוטומטית לשכיחות גבוהה / נמוכה. אפשר להוריד קובץ דוגמה.",
    importExcelPersonalBasketColumns:
      "לקובץ הדוגמה יש את העמודות: שם משפחה, שם פרטי, ת.ז., ת. לידה, כתה, ז/נ, כתובת, ישוב, שם האב, נייד אב, מייל אבא, שם האם, נייד אם, מייל אמא, שכיחות, מורה אחראית, אפיון, תאריך כניסה לשילוב, מייל הורים, מצב משפחתי, אחראי יחיד, מחנכת, תאריך וועדת אפיון וזכאות, תומכת חינוך, טיפולים נוספים, הערות, שנה קלנדרית.",
    importExcelFrequencyHigh: "גבוהה",
    importExcelFrequencyLow: "נמוכה",
    importExcelFrequencyUnknown: "לא זוהתה — ברירת מחדל גבוהה",
    importExcelDownloadSample: "הורדת קובץ אקסל לדוגמה",
    importExcelNoticeTitle: "חשוב לדעת לפני הייבוא",
    importExcelNoticeMissing:
      "אם חסרים שדות בקובץ — השדות החסרים יישארו ריקים בכרטיס התלמיד.",
    importExcelNoticeUnknown:
      "אם בקובץ האקסל מופיעים שדות שלא קיימים במערכת — הם לא יועלו לפרטי התלמיד.",
    importExcelChooseFile: "בחירת קובץ אקסל",
    importExcelPreview: "תצוגה מקדימה",
    importExcelConfirm: "ייבוא תלמידים תקינים",
    importExcelImporting: "מייבא...",
    importExcelNoRows: "לא נמצאו שורות בקובץ",
    importExcelParseError: "לא ניתן לקרוא את הקובץ — בדקו שזה אקסל תקין",
    importExcelMissingName: "חסר שם",
    importExcelIdNumberOtherStatus:
      "ת.ז. כבר קיימת אצל תלמיד בסטטוס/קטגוריה אחרת — לא עודכן",
    importExcelDuplicate: "כבר קיים ברשימה — ידולג",
    importExcelDuplicateInFile: "כפול בקובץ — ידולג",
    importExcelUpdate: "קיים — יתעדכן",
    importExcelOk: "תקין",
    importExcelSummary:
      "נוצרו {created}, דולגו {skipped}, נכשלו {failed}",
    importExcelSummaryFull:
      "נוצרו {created}, עודכנו {updated}, דולגו {skipped}, נכשלו {failed}",
    importExcelClassNameLabel: "שם כיתה לייבוא",
    importExcelClose: "סגירה",
    importExcelOwnerAssignsTeacher: "רק הרכזת משייכת מורה",
    scheduleImportExcel: "ייבוא מאקסל",
    scheduleImportHint:
      "העלו קובץ אקסל בפורמט ימים ושעות: עמודות ראשון–שישי ושורות שיעורים 1–7, או להפך.",
    scheduleImportOk: "המערכת יובאה — {count} תאים מולאו. שמרו את הטופס כדי לשמור.",
    scheduleImportEmpty: "לא נמצאה טבלת מערכת שעות בקובץ. בדקו שיש כותרות ימים או מספרי שיעורים.",
    midYearIntakeButton: "העלאת תלמידים חדשים לשנה",
    midYearIntakeChooseTitle: "בחירת קטגוריה",
    midYearIntakeChooseDescription:
      "לאיזו רשימה יועדו התלמידים החדשים? אפשר להוסיף אותם לרשימת קליטה ואחר כך להעביר לרשימה הראשית.",
    midYearIntakeChooseFrequency: "בחרו שכיחות לסל אישי",
    midYearIntakeContinue: "המשך לרשימת הקליטה",
    midYearIntakeListTitle: "תלמידים חדשים לשנה",
    midYearIntakeTransferConfirm:
      "להעביר את כל התלמידים ברשימה זו לרשימה הראשית?",
    studentsArchiveButton: "ארכיון",
    studentsArchiveTitle: "ארכיון תיקי תלמידים",
    studentsArchiveSubtitle:
      "תיקים שהועברו לארכיון (למשל בסיום בית הספר) — נשמרים כאן 8 שנים",
    studentsArchiveEmpty: "אין תיקים בארכיון עדיין",
    studentsArchiveHint:
      "תלמידים בארכיון לא מופיעים ברשימות הפעילות. אפשר לפתוח את התיק או לשחזר.",
    studentsArchiveRestore: "שחזור לרשימה פעילה",
    studentsArchiveRestoreBusy: "משחזר…",
    studentsArchiveRestoreError: "לא ניתן לשחזר את התיק כרגע — נסו שוב",
    studentsArchiveOpenCard: "כרטיס תלמיד",
    studentsArchiveOpenPortfolio: "תיק תלמיד",
    studentsArchiveDateLabel: "הועבר לארכיון",
    integrationRenewalAlertTitle: "יש לחדש את השילוב",
    integrationRenewalAlertHint:
      "לתלמידים האלה מתקרבות או כבר עברו 3 שנים מתאריך הכניסה לשילוב. אחרי החידוש עדכנו את התאריך בכרטיס.",
    integrationRenewalBadge: "חידוש שילוב",
    integrationRenewalOverdueBadge: "פג תוקף השילוב",
  },

  status: {
    integration: "תלמידי שילוב",
    personalBasket: "תלמידי סל אישי",
    specialEdClass: "כיתות חינוך מיוחד",
    integrationTeacher: "צוות החינוך המיוחד",
    integrationListTitle: "רשימת תלמידי שילוב",
    personalBasketListTitle: "רשימת תלמידי סל אישי",
    specialEdClassListTitle: "רשימת כיתות חינוך מיוחד",
    specialEdStudentListTitle: "רשימת תלמידי הכיתה",
    integrationTeacherListTitle: "איש צוות",
    frequencyListTitle: "בחרו שכיחות",
    frequencyHigh: "שכיחות גבוהה",
    frequencyLow: "שכיחות נמוכה",
    frequencyHighListTitle: "תלמידי סל אישי — שכיחות גבוהה",
    frequencyLowListTitle: "תלמידי סל אישי — שכיחות נמוכה",
    backToFrequencies: "חזרה לבחירת שכיחות",
    specialEdModeListTitle: "ניהול כיתת חינוך מיוחד",
    specialEdModeListSubtitle: "",
    specialEdExcelImportRecommended:
      "מומלץ: העלו קובץ אקסל עם רשימת התלמידים — הרשימה תתעדכן אוטומטית",
    specialEdOrManualEntry: "או בחרו הזנה ידנית:",
    specialEdModeStudent: "תיק תלמיד כיתה",
    specialEdModeStudentHint: "",
    specialEdModeCurriculum: 'תל"כ - תוכנית לימודים כיתתית',
    specialEdModeCurriculumHint: "",
    specialEdModeBackToModes: "חזרה לניהול כיתת חינוך מיוחד",
    specialEdModeBackToTeachers: "חזרה לרשימת המורות",
    specialFrameworkStaff: "צוות חינוך מיוחד",
    specialFrameworkClass: "כיתה",
    specialFrameworkClassHint: "אפיון כיתה · שם מחנכת",
    specialEdClassAdd: "הוספת כיתה",
    specialEdClassAddTitle: "הוספת כיתה חדשה",
    specialEdClassNameLabel: "שם הכיתה",
    specialEdClassNameRequired: "יש להזין שם כיתה",
    specialEdClassBackToList: "חזרה לרשימת הכיתות",
    specialEdClassEmpty: "עדיין אין כיתות — הוסיפו כיתה כדי להתחיל",
    specialEdClassDeleteTitle: "מחיקת כיתה",
    specialEdClassDeleteEmptyDescription: "האם למחוק את הכיתה?",
    specialEdClassDeleteWithStudentsDescription:
      "האם למחוק את הכיתה ואת כל התלמידים? פעולה זו אינה הפיכה.",
    specialEdClassDeleteConfirm: "מחיקה",
    specialEdClassDeleteBusy: "מוחק…",
    specialEdClassDeleteError: "לא ניתן למחוק את הכיתה כרגע — נסו שוב",
    specialEdClassArchiveTitle: "העברת כיתה לארכיון",
    specialEdClassArchiveDescription:
      "כל התלמידים בכיתה יועברו לארכיון. ניתן לשחזר תלמידים מהארכיון בנפרד.",
    specialEdClassArchiveConfirm: "העברה לארכיון",
    specialEdClassArchiveBusy: "מעביר לארכיון…",
    specialEdClassArchiveError: "לא ניתן להעביר לארכיון כרגע — נסו שוב",
    specialEdHomeroomTitle: "מחנכת הכיתה",
    specialEdHomeroomNameLabel: "שם המחנכת",
    specialEdHomeroomEmailLabel: "כתובת מייל",
    specialEdHomeroomSendLink: "שלח קישור",
    specialEdHomeroomSending: "שולח…",
    specialEdHomeroomNameRequired: "יש להזין שם מחנכת",
    specialEdHomeroomEmailInvalid: "כתובת המייל אינה תקינה",
    specialEdHomeroomReassignTitle: "תלמידות שמשויכות למורה אחרת",
    specialEdHomeroomReassignDescription:
      "השיוך יישמר רק לתלמידות בלי מורה, אלא אם תאשרי להעביר גם את אלה שכבר משויכות.",
    specialEdHomeroomReassignConfirm: "אשרי העברת השיוך",
    specialEdHomeroomReassignCancel: "בטלי",
    teachersListTitle: "איש צוות",
    teachersEmptyList: "אין מורות רשומות בקטגוריה זו עדיין",
    backToTeachers: "חזרה לרשימת המורות",
    backToStaffList: "חזרה לרשימת אנשי צוות",
    addTeacher: "הוספת מורה",
    addTeacherPlaceholder: "",
    addStaffCard: "הוסף איש צוות",
    teachersRosterTab: "רשימת מורות",
    teachersRosterTitle: "איש צוות",
    teacherStudentsHeading: "תלמידים המקושרים למורה",
  },

  categories: {
    schools: "בתי ספר",
    highSchools: "תיכונים",
    kindergartens: "גני ילדים",
    tutorials: "סרטוני הדרכה",
    schoolsSubtitle:
      "ניהול תלמידים ומורות בבתי ספר יסודיים בחינוך המיוחד",
    highSchoolsSubtitle:
      "ניהול תלמידים ומורות בחטיבות ביניים ותיכונים בחינוך המיוחד",
    kindergartensSubtitle:
      "ניהול צוות וילדים בגני חינוך מיוחד, גני שפה וגני שילוב",
    tutorialsSubtitle: "ספריית סרטונים ללימוד השימוש במערכת",
  },

  categoryDetail: {
    backToDashboard: "חזרה לדשבורד",
    inDevelopment: "הקטגוריה בהרצה - התוכן יתווסף בהמשך",
    promptPersonalArea:
      "נא להיכנס לאזור האישי כדי לנהל תלמידים בקטגוריה זו",
    manageStudents: "ניהול תלמידים",
    summaryTable: "טבלת סיכום",
  },

  tutorials: {
    item1Title: "איך להירשם למערכת",
    item1Description: "הסבר על תהליך הרישום למערכת",
    item2Title: "יצירת כרטיס תלמיד",
    item2Description: "הוספת תלמיד חדש לרשימה - מהיר וקל",
    item3Title: "ניהול קטגוריות",
    item3Description: "חלוקת התלמידים לפי בית ספר, גיל וסטטוס",
    item4Title: "טבלת סיכום ורשימות",
    item4Description: "צפייה בסיכום כל התלמידים במקום אחד",
    comingSoon: "בקרוב - הסרטון בהכנה",
    emptyList: "אין סרטונים להצגה",
    deleteTitle: "מחיקת סרטון",
    deleteConfirm: "למחוק את כרטיס הסרטון הזה מהספרייה?",
    addButton: "הוספת סרטון",
    addTitle: "סרטון חדש",
    addDescription: "הוסיפו כותרת, תיאור וקישור לסרטון (אפשר גם להעלות קובץ אחר כך)",
    titleLabel: "כותרת",
    descriptionLabel: "תיאור",
    urlLabel: "קישור לסרטון (YouTube / Vimeo / קישור ישיר)",
    attachUrl: "חיבור קישור",
    attachUrlTitle: "חיבור קישור לסרטון",
    attachUrlDescription: "הדביקו קישור ליוטיוב, וימאו או קובץ וידאו",
    saveUrl: "שמירת קישור",
    uploadVideo: "העלאת קובץ",
    removeVideo: "הסרת סרטון",
  },

  studentFields: {
    name: "שם מלא",
    firstName: "שם פרטי",
    lastName: "שם משפחה",
    phone: "טלפון",
    father: "שם האב",
    mother: "שם האם",
    className: "כיתה",
    teacher: "מורה",
    responsibleTeacher: "מורה אחראית",
    homeroomTeacher: "מחנכת",
    educationSupport: "תומכת חינוך",
    role: "תפקיד",
    characterization: "אפיון",
    familyStatus: "מצב משפחתי",
    singleResponsibleParty: "אחראי יחיד",
    singleResponsiblePartyYes: "כן — אחראי יחיד",
    singleResponsiblePartyNo: "לא — שני הורים",
    integrationStartDate: "תאריך כניסה לשילוב",
    eligibilityCommitteeDate: "תאריך וועדת אפיון וזכאות",
    additionalTreatments: "טיפולים נוספים",
    parentsEmail: "מייל הורים",
    notes: "הערות",
    calendarYear: "שנה קלנדרית",
    integrationFrequency: "שכיחות",
    frequencyHigh: "שכיחות גבוהה",
    frequencyLow: "שכיחות נמוכה",
    idNumber: "ת.ז",
    birthDate: "ת. לידה",
    gender: "מין",
    homeAddress: "כתובת",
    city: "ישוב",
    fatherMobile: "טלפון האב",
    fatherEmail: "מייל אבא",
    motherMobile: "טלפון אם",
    motherEmail: "מייל אמא",
    email: "מייל הורים",
  },

  studentDocuments: {
    title: "מסמכים",
    uploadButton: "העלאת מסמך",
    uploadHint: `PDF, Word, Excel או תמונה — עד ${formatUploadLimitLabel()} לקובץ`,
    emptyList: "אין מסמכים פעילים בקטגוריה זו עדיין",
    deleteButton: "הסרה",
    fileTooLarge: `הקובץ גדול מדי (מקסימום ${formatUploadLimitLabel()})`,
    uploading: "מעלה...",
    folderLabel: "תיקיית מסמכים",
    uploadFolderLabel: "העלאה לתיקייה",
    addFolderButton: "תיקייה חדשה",
    newFolderPlaceholder: "",
    saveFolderButton: "יצירת תיקייה",
    activeTitle: "מסמכים פעילים",
    archiveTitle: "ארכיון",
    archiveHint: "מסמכים שהועברו לארכיון נשמרים כאן 8 שנים — ואז נמחקים אוטומטית. ניתן לשחזר או להסיר לפני כן",
    archiveEmpty: "הארכיון ריק",
    archiveButton: "לארכיון",
    restoreButton: "שחזור",
    openButton: "פתיחה",
    downloadButton: "הורדה",
    archiveByYearTitle: "ארכיון לפי שנים",
    archiveYearLabel: "שנה",
    moveToFolderButton: "העברה לתיקייה",
    moveToFolderTitle: "העברת מסמך לתיקייה אחרת",
    moveToFolderConfirm: "העברה",
    restoreToFolderTitle: "שחזור לתיקייה",
    restoreToFolderConfirm: "שחזור לתיקייה",
    moveSuccess: "המסמך הועבר לתיקייה שנבחרה",
    currentFolderLabel: "תיקייה נוכחית",
  },

  studentPortfolio: {
    title: "תיק התלמיד",
    subtitle: "בחרו קטגוריית מסמכים",
    backToPortfolio: "חזרה לתיק התלמיד",
    backToCard: "חזרה לכרטיס התלמיד",
    goToPortfolio: "מעבר לתיק התלמיד",
    addFolderButton: "תיקייה חדשה",
    newFolderPlaceholder: "",
    saveFolderButton: "יצירת תיקייה",
    removeFolderButton: "הסרת תיקייה",
    removeFolderConfirm: "להסיר את התיקייה? ניתן להסיר רק תיקייה ריקה ממסמכים.",
    removeFolderBlocked: "לא ניתן להסיר תיקייה שמכילה מסמכים — העבירו או מחקו אותם קודם",
    addActionButton: "הוספת כפתור",
    fillDocument: "מסמך למילוי",
    independentUpload: "העלאה עצמאית",
    uploadFillDocument: "העלאת מסמך למילוי",
    uploadIndependent: "העלאה עצמאית",
    fillEmpty: "אין מסמך למילוי עדיין",
    addNamedDocument: "הוספת מסמך",
    namedDocumentPlaceholder: "",
    backToFolder: "חזרה לתיקיות",
    formsPageSubtitle: "כל הטפסים בתיקייה — ניתן לפתוח או להוריד כל טופס",
    filledFormsListTitle: "טפסים שמולאו",
    filledFormsListEmpty: "עדיין לא מולאו טפסים בתיקייה זו",
    allFormsTitle: "כל הטפסים",
    formsEmpty: "אין טפסים בתיקייה עדיין",
    fillFormHint:
      "השדות מתמלאים מכרטיס התלמיד — ניתן לערוך, לשמור או להדפיס בנפרד",
    saveDraft: "שמירת טיוטה",
    saveAndSnapshot: "שמירה + עותק להדפסה",
    saveArchiveAndPrint: "שמירה בארכיון + עותק להדפסה",
    saveForm: "שמירה",
    printForm: "הדפסה",
    printBlockedFreeAccess: "בכניסה חופשית אין אפשרות להדפסת טפסים",
    goToNextForm: "טופס הבא",
    goToNextFolder: "תיקייה הבאה",
    schoolLogoLabel: "לוגו בית הספר",
    schoolLogoUpload: "העלאת לוגו בי״ס",
    schoolLogoRemove: "הסרת לוגו",
    schoolLogoEmpty: "אין לוגו",
    schoolLogoAlt: "לוגו בית הספר",
    schoolLogoHint:
      "בצד ימין בראש המסמך — לוגו בית הספר (לצד לוגו העמותה בשמאל, אם הועלה)",
    schoolLogoTooLarge: "הלוגו גדול מדי (עד כ־800KB)",
    schoolLogoNotImage: "יש להעלות קובץ תמונה",
    schoolLogoError: "העלאת הלוגו נכשלה",
    greenSignatureTypeMode: "הקלדת שם",
    greenSignatureDrawMode: "חתימה ירוקה",
    greenSignatureWhatIs: "מה זה חתימה ירוקה?",
    greenSignatureExplainTitle: "חתימה ירוקה — מה זה ואיך זה עובד",
    greenSignatureExplainBody:
      "חתימה ירוקה היא חתימה דיגיטלית על המסך — בלי להדפיס על נייר. חותמים באצבע או בעכבר על קו החתימה, והחתימה נשמרת עם הטופס ומופיעה גם בהדפסה ובהורדה.",
    greenSignatureClear: "ניקוי",
    greenSignatureSave: "שמירת חתימה",
    greenSignatureSaved: "החתימה נשמרה",
    greenSignatureHint: "ציירו את החתימה באצבע או בעכבר",
    parentSignatureLockedHint:
      "חתימת הורים — יש לשלוח את הטופס לחתימה. לא ניתן לחתום במקום ההורים.",
    parentSignatureReceivedHint: "החתימה התקבלה מההורים",
    thirdPartySignatureLockedHint:
      "חתימה של בעל/ת תפקיד — יש לשלוח את הטופס לחתימה. לא ניתן לחתום במקומם.",
    thirdPartySignatureReceivedHint: "החתימה התקבלה מהחותם/ת",
    openFillForm: "מעבר למילוי הטופס",
    sendParentQuestionnaire: "שליחה למייל ההורים",
    openParentQuestionnaireReturned: 'טופס בניית תח"י',
    openParentQuestionnaireTlaReturned: 'טופס בניית תל"א',
    noStructuredForm: "אין טופס מובנה לתיקייה זו — ניתן להעלות קובץ בהעלאה עצמאית",
    waiverRequiredTitle: "נדרשות חתימות שני ההורים",
    waiverRequiredDescription:
      "לא ניתן לפתוח או למלא טפסים אחרים לפני ששני ההורים חתמו על טופס ויתור הסודיות.",
    waiverBothParentsRequiredTitle:
      "נדרשות חתימות שני ההורים על ויתור הסודיות",
    waiverBothParentsRequiredDescription:
      "לא ניתן לעבור לטופס הבא — שני ההורים עדיין לא חתמו על טופס ויתור הסודיות. לאחר חתימת האב וחתימת האם ייפתחו שאר הטפסים.",
    waiverNextFormBlocked:
      "לא ניתן לעבור לטופס הבא — שני ההורים עדיין לא חתמו על ויתור הסודיות.",
    waiverRequiredGoFill: "מעבר לטופס ויתור סודיות",
    waiverRequiredClose: "סגירה",
    waiverUploadDoesNotUnlock:
      "העלאה עצמאית לתיקייה אינה פותחת את התיק. סריקה חתומה של ויתור הסודיות פותחת את תיק התלמיד — בלי אישור ידני; חתימות דיגיטליות של שני ההורים הן חלופה.",
    paperWaiverTitle: "סריקה חתומה של ויתור סודיות",
    paperWaiverDescription:
      "אם להורים אין מייל, אפשר להעלות סריקה או צילום של הויתור החתום על נייר. ההעלאה פותחת את תיק התלמיד — בלי אישור ידני.",
    paperWaiverUpload: "העלאת סריקה חתומה",
    paperWaiverReplace: "החלפת הסריקה",
    paperWaiverRemove: "הסרת הסריקה",
    paperWaiverView: "צפייה בסריקה",
    paperWaiverSatisfied: "הויתור קוים בסריקה חתומה שהועלתה",
    paperWaiverDigitalSatisfied: "הויתור קוים בחתימה דיגיטלית",
    paperWaiverBothSatisfied: "הויתור קוים בחתימה דיגיטלית וגם בסריקה חתומה",
    paperWaiverPendingDigitalNote:
      "אם נשלחה בקשת חתימה דיגיטלית — היא נשארת פעילה. התיק פתוח בזכות הסריקה.",
    paperWaiverTypeError: "יש להעלות קובץ PDF או תמונה (JPG/PNG).",
    paperWaiverUploading: "מעלה סריקה...",
    paperWaiverUploadedAt: "הועלה בתאריך",
    paperWaiverRemoved: "הסריקה הוסרה. התיק נעול עד לחתימה דיגיטלית או לסריקה חדשה.",
    paperWaiverRemoveFailed: "הסרת הסריקה נכשלה — נסו שוב",
    paperWaiverRemoving: "מסיר...",
    paperWaiverRestoreBlocked:
      "לא ניתן לשחזר סריקת ויתור סודיות כשכבר קיימת סריקה פעילה. הסירו את הסריקה הפעילה מהפאנל קודם.",
    paperWaiverArchiveDeleteBlocked:
      "לא ניתן למחוק סריקת ויתור סודיות מהארכיון — הרשומה נשמרת 8 שנים. הסירו סריקה פעילה רק דרך פאנל הסריקה.",
    paperWaiverUseArchiveOp:
      "ארכוב סריקת ויתור סודיות נעשה בפעולה היעודית — הרשומה נשמרת 8 שנים.",
    printFolder: "הדפסת כל המסמכים בתיקייה",
    printFolderEmpty: "אין מסמכים להדפסה בתיקייה זו",
    printSelected: "הדפסת תיקיות נבחרות",
    printSelectedEmpty: "בחרו לפחות תיקייה אחת להדפסה",
    selectFoldersHint: "סמנו תיקיות להדפסה משותפת",
    clearFolderSelection: "ניקוי בחירה",
    catGeneralInfo: "אינפורמציה כללית",
    catDiagnoses: "אבחונים ודוחות",
    catHearingVision: "בדיקות שמיעה וראיה",
    catLearningProcess: "תיעוד תהליך למידה",
    catTherapy: 'תח"י',
    catClassCurriculum: 'תל"כ',
    catTla: 'תל"א',
    catInclusion: "שילוב",
    catTherapeuticIntegration: "אינטגרציה טיפולית",
    catTherapeuticInteraction: "אינטראקציה טיפולית",
    catAchievements: "מעקב אחרי הישגי התלמיד",
    catSpecialEdAchievements: "מעקב הישגי התלמיד",
    catExtraDocuments: "מסמכים נוספים",
  },

  voiceRecorder: {
    startRecording: "הקליטי",
    stopRecording: "עצירה",
    refining: "מסדרת לך את הטקסט...",
    slogan: "הקליטי — ותהני",
    promoTitle: "הקליטי — ותהני 🎙️",
    promoSubtitle:
      "לחצי על המיקרופון האדום ליד שדה טקסט — דברי בעברית, ואנחנו נסדר את הניסוח בשבילך",
    aiUnavailable: "AI לא זמין — נשמר תמלול גולמי",
    aiUnauthorized: "יש להתחבר כדי להשתמש ב-AI",
    aiRateLimited: "יותר מדי בקשות — נסה שוב בעוד רגע",
    aiTimeout: "סידור AI ארך יותר מדי — נשמר תמלול גולמי",
    browserUnsupported: "ההקלטה לא נתמכת בדפדפן זה",
    noSpeech: "לא זוהה דיבור",
    micNotAllowed: "אין הרשאה למיקרופון",
    micMissing: "לא נמצא מיקרופון",
    genericError: "שגיאה בהקלטה",
    refineTyped: "נסחי לי",
    refineTypedUnavailable: "הניסוח לא זמין כרגע",
    refineTypedFailed: "הניסוח נכשל — נסה שוב",
    refineTypedTimeout: "הניסוח ארך יותר מדי — נסה שוב",
    refineTypedEmpty: "לא התקבלו שינויים מה-AI",
    refineTypedChanged: "השדה השתנה בזמן הניסוח — לא הוחלף",
    refineTooLong: "הטקסט ארוך מדי לניסוח — עד 2000 תווים",
  },

  formAiFill: {
    title: "מילוי המסמך בעזרת AI",
    subtitle:
      "לחצי כדי לקבל טיוטה מלאה לשדות הריקים — אפשר גם להוסיף הנחיה קצרה למטה",
    prepSubtitle:
      "הקליטי או כתבי מה יודעים על התלמיד/ה — ה-AI ימלא רק את השדות שיש עליהם מידע, וישאיר ריק את השאר",
    prepHowTitle: "איך ממלאים דף הכנה עם AI",
    prepStep1: "הקליטי בקול (או כתבי) בקצרה מה יודעים על התלמיד/ה",
    prepStep2:
      "לחצי על מילוי AI — הוא ימלא רק קוביות/שדות שיש עליהם מידע מהתיאור",
    prepNotesLabel: "תיאור התלמיד/ה ל-AI",
    prepNotesVoiceHint:
      "לחצי על הרמקול והקליטי — אפשר גם לתקן את הטקסט אחרי ההקלטה",
    prepNotesPlaceholder:
      "למשל: רקע משפחתי מורכב, אבחון ADHD, חוזקות בקריאה חברתית...",
    prepNotesRequired: "הקליטי או כתבי תיאור קצר של התלמיד/ה לפני מילוי AI",
    prepButton: "מילוי בעזרת AI",
    tachiSubtitle:
      "כתבי מצב נוכחי ומטרת על, ואז בקשי מה-AI להציע תוכנית עבודה — ותקני לפי הצורך",
    tachiHowTitle: "איך ממלאים תח״י עם AI",
    tachiStep1: "כתבי «מצב נוכחי» ו«מטרת על» בטופס",
    tachiStep2:
      "לחצי על מילוי AI — הוא יציע תוכנית עבודה (יעדים / דרכי הוראה / מעקב)",
    tachiStep3: "תקני לפי הצורך ושמרי",
    tachiNotesPlaceholder:
      "למשל: דגש על קריאה וויסות רגשי; הצעי 3–4 יעדים מעשיים...",
    tachiButton: "הציעי תוכנית עבודה בעזרת AI",
    tachiIntegrativeSubtitle:
      "מלאי תחום, קו בסיס ומטרות על — ה-AI יציע תוכנית עבודה בטבלה כמו בתבנית",
    tachiIntegrativeHowTitle: "איך ממלאים תח״י אינטגרטיבי עם AI",
    tachiIntegrativeStep1: "מלאי «תחום», «קו בסיס» ו«מטרות על» בטופס",
    tachiIntegrativeStep2:
      "לחצי על מילוי AI — הוא יציע תוכנית עבודה בטבלה (יעדים / מורה / סייעת / אחר / הערכה)",
    tachiIntegrativeNotesPlaceholder:
      "למשל: תחום ויסות רגשי; דגש על שיתוף פעולה בין המחנכת למורת השילוב...",
    tachiIntegrativeButton: "הציעי תוכנית עבודה ודרכי הוראה לצוות",
    notesLabel: "הנחיה ל-AI (אופציונלי)",
    notesVoiceHint: "אפשר גם להקליט הנחיה בקול — לחצי על המיקרופון",
    refineFollowUpHint:
      "אחרי שהתח״י מתמלא, אפשר לכתוב ל־AI הנחיה חדשה כדי לעדכן את הניסוח",
    notesPlaceholder:
      "למשל: התלמיד מתקשה בקריאה, דגש על ויסות רגשי...",
    exampleLabel: "דוגמת מילוי ל-AI (אופציונלי)",
    exampleHint:
      "הדוגמה מלמדת את ה-AI איך למלא — סגנון, מבנה ורמת פירוט. אם הועלתה דוגמה באזור האישי היא נבחרת אוטומטית",
    exampleSharedLabel: "דוגמה שמורה ל-AI",
    exampleSharedHint:
      "ה-AI משתמש בדוגמה זו כדי למלא טוב יותר — לא להעתקת פרטים אישיים מהדוגמה",
    exampleSharedNone: "אין עדיין דוגמה לטופס זה — ניתן להעלות באזור האישי",
    exampleSharedSelect: "בחירת דוגמה ל-AI",
    examplePersonalOverride: "החלפה זמנית בדוגמה אחרת למילוי זה",
    exampleUpload: "העלאת דוגמה למילוי זה",
    exampleReading: "קוראת קובץ...",
    exampleEmpty: "לא נמצא טקסט בקובץ — נסי קובץ אחר",
    exampleReadFailed: "לא הצלחתי לקרוא את הקובץ — נסי שוב או העלי TXT",
    exampleTooLarge: "הקובץ גדול מדי (עד 4MB)",
    exampleUnsupported: "סוג קובץ לא נתמך — העלי Word (.docx), PDF או TXT",
    exampleDocLegacy: "קבצי .doc ישנים לא נתמכים — שמרי כ-.docx או PDF או TXT",
    button: "מלאי את כל המסמך בעזרת AI",
    loading: "ממלאת את המסמך...",
    disclaimer:
      "מילוי זה הוא הצעה בלבד בעזרת בינה מלאכותית. האחריות לתוכן המסמך, לדיוקו ולהתאמתו לתלמיד/ה ולמציאות בשטח מוטלת על המורה והצוות הממלאים. יש לעבור על כל השדות, לתקן לפי הצורך ולאשר לפני שמירה.",
    success: "הטיוטה מולאה — עברי על השדות, תקני לפי הצורך ושמרי",
    emptyResult: "לא התקבלו הצעות חדשות — נסי להוסיף הנחיה קצרה",
    unauthorized: "יש להתחבר כדי להשתמש ב-AI",
    rateLimited: "יותר מדי בקשות — נסי שוב בעוד רגע",
    unavailable: "AI לא זמין כרגע",
    notAllowed: "מילוי AI לא זמין לטופס זה",
    timeout: "המילוי ארך יותר מדי — נסי שוב בעוד רגע",
    failed: "מילוי הטופס נכשל — נסי שוב",
  },

  studentCustomFields: {
    title: "שדות נוספים",
    addButton: "הוספת שדה",
    emptyList: "אין שדות נוספים — ניתן להוסיף שדה מותאם אישית",
    labelPlaceholder: "",
    valuePlaceholder: "",
    saveButton: "שמירה",
    deleteButton: "מחיקת שדה",
    addTitle: "הוספת שדה חדש",
    editTitle: "עריכת שדה",
    labelRequired: "יש להזין שם לשדה",
  },

  studentCard: {
    restoreFieldTitle: "החזרת שדה לכרטיס",
    restoreFieldButton: "הוספה",
    deleteFieldConfirm: "למחוק את השדה מהכרטיס?",
    calendarYearLabel: "שנה קלנדרית",
    calendarYearSave: "שמירת שנה",
    calendarYearSaved: "השנה נשמרה",
    transferToPersonalBasket: "העברה לסל אישי",
    transferToPersonalBasketTitle: "העברת תיק משילוב לסל אישי",
    transferToPersonalBasketDescription:
      "התיק והמסמכים יישמרו. התלמיד/ה יופיע/ו ברשימת סל אישי לפי השכיחות שתבחרו.",
    transferToPersonalBasketConfirm: "העברה לסל אישי",
    transferToPersonalBasketBusy: "מעביר…",
    transferToPersonalBasketError: "לא ניתן להעביר את התיק כרגע — נסו שוב",
    transferFrequencyLabel: "שכיחות בסל אישי",
    archiveStudentFile: "העברה לארכיון",
    archiveStudentFileTitle: "העברת תיק תלמיד לארכיון",
    archiveStudentFileDescription:
      "התיק יוסר מהרשימות הפעילות ויישמר בארכיון למשך 8 שנים. כל המסמכים הפעילים יועברו לארכיון.",
    archiveStudentFileConfirm: "העברה לארכיון",
    archiveStudentFileBusy: "מעביר לארכיון…",
    archiveStudentFileError: "לא ניתן להעביר לארכיון כרגע — נסו שוב",
    restoreStudentFile: "שחזור מהארכיון",
    restoreStudentFileTitle: "שחזור תיק מהארכיון",
    restoreStudentFileDescription:
      "התלמיד/ה יופיע/ו שוב ברשימות הפעילות. מסמכים שכבר בארכיון תיקיות יישארו שם.",
    restoreStudentFileConfirm: "שחזור",
    restoreStudentFileBusy: "משחזר…",
    restoreStudentFileError: "לא ניתן לשחזר כרגע — נסו שוב",
    archivedBanner: "תיק זה בארכיון — ניתן לצפות או לשחזר לרשימה פעילה",
    teacherInviteSend: "שליחת הזמנה לכניסה",
    teacherInviteTitle: "הזמנת מורה למערכת",
    teacherInviteDescription:
      "יישלח מייל עם קישור כניסה ייחודי לכתובת:",
    teacherInviteConfirm: "שליחת הזמנה",
    teacherInviteBusy: "שולח…",
    teacherInviteSuccess: "ההזמנה נשלחה בהצלחה",
    teacherInviteError: "שליחת ההזמנה נכשלה — נסו שוב",
    teacherInviteNoEmail: "יש להוסיף כתובת מייל בכרטיס לפני שליחת הזמנה",
    teacherInviteAlreadyHasAccount:
      "כבר קיים חשבון עם כתובת מייל זו במוסד",
    teacherInviteAlreadyLinked: "למורה כבר יש חשבון מקושר",
    teacherInviteNotStaff: "ניתן לשלוח הזמנה רק מכרטיס איש צוות",
    teacherInviteRateLimited:
      "נשלחו יותר מדי הזמנות — נסו שוב בעוד מספר דקות",
    teacherInviteUnauthorized: "יש להתחבר מחדש",
      teacherInviteForbidden: "רק רכזת השילוב של המוסד יכולה לשלוח הזמנות למורות",
    teacherInviteClose: "סגור",
  },

  auth: {
    step1Badge: "שלב 1 מתוך 2",
    step1Title: "רישום לאזור האישי",
    step1Subtitle: "נא למלא את הפרטים האישיים",
    step2Badge: "שלב 2 מתוך 2",
    step2Title: "פרטי המוסד",
    step2Subtitle: "נא להזין את פרטי המוסד בו את/ה עובד/ת",
    nameLabel: "שם מלא",
    phoneLabel: "טלפון",
    emailLabel: "כתובת מייל",
    institutionCodeLabel: "סמל מוסד",
    institutionNameLabel: "שם המוסד",
    schoolNameLabel: "שם בית הספר",
    termsCheckbox:
      "אני מאשר/ת את תקנון שימוש האתר, מדיניות הפרטיות והצהרת הנגישות של מערכת פרוטוקל",
    submitButton: "לחצו כאן לסיום הרישום",
    continueButton: "המשך לשלב הבא",
    saveStepButton: "שמירת השלב",
    saveAndContinue: "שמירה והמשך",
    savedSuccess: "הפרטים נשמרו — אפשר להמשיך מאוחר יותר",
    step1SummaryTitle: "פרטים משלב 1 (אוטומטי)",
    nameShort: "שם",
    phoneShort: "טלפון",
    emailShort: "מייל",
    passwordLabel: "סיסמה",
    confirmPasswordLabel: "אימות סיסמה",
    loginTitle: "כניסה לאזור האישי",
    loginSubtitle: "הכניסה מתבצעת עם קוד חד־פעמי שנשלח לכתובת המייל של החשבון",
    loginButton: "כניסה",
    otpSubtitle: "נשלח קוד חד־פעמי לכתובת המייל — זו הדרך היחידה להתחבר",
    otpSendButton: "שליחת קוד כניסה",
    otpCodeLabel: "קוד הכניסה מהמייל",
    otpVerifyButton: "כניסה עם הקוד",
    otpResend: "שליחת קוד חדש",
    otpChangeEmail: "שינוי כתובת מייל",
    registerLink: "רישום חדש לאזור האישי",
    noAccountPrompt: "עדיין אין לך אזור אישי?",
    continuePendingRegistration: "המשך רישום שהתחלת",
    forgotLink: "שכחתי סיסמה",
    forgotTitle: "איפוס סיסמה",
    forgotSubtitle: "נשלח קישור לאיפוס לכתובת המייל שהוזנה בהתחברות",
    forgotSubmitButton: "שליחת קישור לאיפוס",
    forgotSending: "שולחים קישור לאיפוס לכתובת המייל שהוזנה בהתחברות...",
    forgotSuccess:
      "אם קיים חשבון עם כתובת המייל שהוזנה, נשלח אליה קישור לאיפוס הסיסמה. בדקו גם את תיקיית הספאם.",
    backToLogin: "חזרה להתחברות",
    resetTitle: "בחירת סיסמה חדשה",
    resetSubtitle: "הזינו סיסמה חדשה לחשבון",
    resetSubmitButton: "שמירת סיסמה חדשה",
    resetMissingToken:
      "קישור האיפוס חסר או לא תקין. בקשו קישור חדש מדף שכחתי סיסמה.",
    resetSuccessBanner: "הסיסמה עודכנה בהצלחה. אפשר להתחבר עם הסיסמה החדשה.",
    inviteTitle: "הצטרפות לפרוטוקל",
    inviteSubtitle: "השלימי את הרישום כדי להיכנס למערכת",
    inviteAccessNoticeTitle: "חשוב לדעת",
    inviteAccessNotice:
      "אחרי ההצטרפות תיכנסי למרחב המוסד המלא — כל עדכון שתעשי יתעדכן אוטומטית אצל כל המורות באותו מוסד.",
    inviteAccessNoticeClose: "הבנתי",
    inviteMissingToken:
      "קישור ההזמנה חסר או לא תקין. בקשי הזמנה חדשה מהמוסד.",
    inviteLoading: "בודקים את קישור ההזמנה...",
    inviteSubmitButton: "השלמת הרישום וכניסה",
    inviteStep1Label: "פרטים בסיסיים",
    inviteStep2Label: "אבטחת מידע",
    inviteStep3Label: "כניסה למוסד",
    inviteStep1Hint: "אשרי את פרטי הקשר שלך לפני המשך הרישום.",
    inviteStep2Hint: "בחרי סיסמה. נשלח קוד אימות לכתובת המייל שלך.",
    inviteContinueButton: "המשך לשלב הבא",
    inviteSendOtpButton: "שליחת קוד אימות",
    inviteOtpHint: "הזיני את קוד האימות שנשלח ל",
    inviteVerifyButton: "אימות וכניסה למוסד",
    inviteRedirecting: "מעבירים אותך למרחב המוסד...",
    inviteExistingLoginTitle: "יש לך כבר חשבון",
    inviteExistingLoginHint:
      "התחברי עם אותו מייל כדי להצטרף למוסד החדש — אין צורך להירשם שוב.",
    inviteResumedLoginHint:
      "כבר יש לך חשבון. הסיסמה שהוזנה כעת לא נשמרה — התחברי עם הסיסמה הקיימת שלך.",
    inviteExistingLoginButton: "התחברי לחשבון הקיים",
    selectInstitutionTitle: "בחירת מוסד",
    selectInstitutionSubtitle: "בחרי באיזה מוסד לעבוד כעת",
  },

  wizard: {
    step1Title: "כרטיס התלמיד",
    step1Subtitle: "פרטים אישיים",
    step1LongSubtitle:
      "בחירת מורה בהתחלה, ואז פרטים אישיים וכיתה — הקטגוריה והסיווג נקבעים מהרשימה שממנה נכנסתם",
    step2Title: "רשימת קטגוריה",
    step2Subtitle: "לאיזו קבוצה שייך/ת",
    step2HeaderTitle: "רשימת תלמידי",
    step2LongSubtitle: "הבחירה תקבע לאיזו רשימה יצטרפו הפרטים",
    step3Title: "טבלת סיכום",
    step3Subtitle: "סיווג התלמיד/ה",
    step3HeaderTitle: "סיווג בטבלת הסיכום",
    step3LongSubtitle: "ניתן להשאיר ללא סיווג ולעדכן בהמשך",
    saveButton: "סיום ושמירה",
    saveChangesButton: "שמירת שינויים",
    saveStepButton: "שמירת השלב",
    saveOnlyButton: "שמירה",
    continueToNext: "המשך לדף הבא",
    saveAndContinue: "שמירה והמשך לדף הבא",
    savedSuccess: "השלב נשמר בהצלחה",
    editButton: "עריכה",
    deleteButton: "מחיקה",
    cancelButton: "ביטול",
    newStudentTitle: "כרטיס תלמיד חדש",
    editStudentTitle: "עריכת כרטיס תלמיד",
    continueToCategory: "המשך לקטגוריה",
    continueToStatus: "המשך לסיווג",
    backToCard: "חזרה לכרטיס",
    backToCategory: "חזרה לקטגוריה",
    noStatus: "ללא סיווג",
    noStatusDescription:
      "נסווג בהמשך - התלמיד/ה יופיע/תופיע רק ברשימת הקטגוריה",
    previewLabel: "תצוגה מקדימה",
    namePreview: "שם:",
    categoryPreview: "קטגוריה:",
    statusPreview: "סיווג:",
    classNameOptional: "כיתה / קבוצה (אופציונלי)",
    teacherOptional: "שם מורה",
    addNewTeacher: "הוספת מורה חדשה",
    notesOptional: "הערות (אופציונלי)",
    categoryHint: "התלמיד/ה יופיע/תופיע ברשימת",
    categoryHintSuffix: "באזור האישי שלך",
    studentNameLabel: "שם התלמיד/ה",
    studentFirstNameLabel: "שם פרטי",
    studentLastNameLabel: "שם משפחה",
    staffCardTitle: "כרטיס איש צוות",
    staffCardSubtitle:
      "ניתן להוסיף ולהסיר שדות בחופשיות — השמירה תעביר לכרטיס המלא",
    staffNameLabel: "שם ומשפחה",
    staffSendInviteCheckbox: "סמני ✓ ושלח לינק כניסה למורה",
    staffSendInviteNoEmailHint:
      "יש להזין כתובת מייל בשדה «מייל» כדי לשלוח הזמנה",
    staffInviteSentSuccess: "הכרטיס נשמר וההזמנה נשלחה למורה",
    fatherShort: "שם האב",
    motherShort: "שם האם",
    stepOf: "שלב",
    stepOfTotal: "מתוך",
    schoolsDesc: "בתי ספר יסודיים",
    highSchoolsDesc: "חטיבות ביניים ותיכונים",
    kindergartensDesc: "גני חינוך מיוחד ושילוב",
    integrationDesc: "תלמידים המשתלבים בכיתה רגילה עם תמיכה",
    personalBasketDesc: "תלמידים בעלי סל אישי ותכנית ייעודית",
    specialEdClassDesc: "תלמידי כיתת חינוך מיוחד",
    integrationTeacherDesc: "צוות החינוך המיוחד",
  },

  terms: {
    title: "תקנון האתר",
    subtitle: "תנאי השימוש במערכת פרוטוקל - יש לקרוא לפני הרישום",
    section1Title: "1. מטרת המערכת",
    section1Body:
      "מערכת פרוטוקל נועדה לרכז ולנהל טפסים, תלמידים ומוסדות בחינוך המיוחד. השימוש מיועד לצוותי הוראה, מדריכות ומנהלות מוסדות בלבד.",
    section2Title: "2. הרשמה ופרטים אישיים",
    section2Body:
      "המשתמש/ת מזין/ה פרטי שם, טלפון, מייל וסמל מוסד. הפרטים ישמשו להתאמת המערכת ולא יועברו לצד שלישי ללא אישור מפורש.",
    section3Title: "3. פרטיות המידע והתלמידים",
    section3Body:
      "כלל המידע על תלמידים נשמר בפרטיות מוחלטת. יש להימנע מהזנת מידע רגיש שאינו נדרש. באחריות המשתמש/ת לשמור על סיסמאות וסמלי מוסד.",
    section4Title: "4. ניידות נתונים",
    section4Body:
      "המשתמש/ת יכול/ה בכל עת ליצא, למחוק או להעביר את הנתונים שלו/ה. הבחירה מה לשמור ומה לא — נתונה כולה בידי המשתמש/ת.",
    section5Title: "5. אחריות ותמיכה",
    section5Body:
      "המערכת מסופקת AS-IS. אנו עושים את מירב המאמצים לוודא זמינות ואמינות, אך אין לראות במערכת תחליף לגיבוי נתונים עצמאי.",
    section6Title: "6. עדכונים לתקנון",
    section6Body:
      "מעת לעת ייתכנו עדכונים לתקנון. במידה ותהיה שינוי מהותי, תישלח הודעה למשתמשים הרשומים.",
  },

  admin: {
    title: "הגדרות מנהל",
    subtitle: "ניהול המערכת ברמת מוסד ומעבר",
    editTextsTitle: "עריכת כיתובים",
    editTextsDescription: "עריכת כל הטקסטים והכותרות באתר",
    saveTexts: "שמירת כיתובים",
    resetTexts: "איפוס לברירת מחדל",
    textsSaved: "הכיתובים נשמרו בהצלחה",
    logsTitle: "לוג פעולות",
    logsSubtitle: "מעקב אחרי פעולות משתמשים במוסד — יצירת תלמידים, טפסים, מסמכים והתחברות",
    logsNavTitle: "לוג פעולות",
    logsNavDescription: "צפייה בהיסטוריית פעולות במוסד — מי עשה מה ומתי",
    logsFilterLabel: "סינון לפי פעולה:",
    logsRefresh: "רענון",
    logsLoading: "טוען לוגים...",
    logsEmpty: "אין רשומות לוג עדיין — פעולות חדשות יופיעו כאן",
    logsError: "טעינת הלוגים נכשלה",
    logsForbidden: "רק מנהל מוסד יכול לצפות בלוג פעולות",
    logsColWhen: "מתי",
    logsColAction: "פעולה",
    logsColUser: "משתמש",
    logsColSummary: "פרטים",
    logsPrev: "הקודם",
    logsNext: "הבא",
  },

  billing: {
    title: "בחירת חבילה",
    subtitle: "בחרו את החבילה המתאימה למוסד שלכם",
    manageTitle: "ניהול חבילה",
    manageSubtitle: "צפייה או שינוי החבילה הנוכחית",
    annualNote:
      "המנוי בתוקף עד 1 באוקטובר. עונת הרכישה נפתחת בכל שנה ב-1 באוגוסט.",
    planIncludesLabel: "החבילה כוללת:",
    selectedBadge: "נבחר",
    priceNote: "לשנת לימודים",
    continueToPayment: "המשך לתשלום",
    saving: "שומר...",
    changePlan: "שינוי חבילה",
    changeFramework: "שינוי מסגרת חינוך (רגיל / מיוחד)",
    currentPlanLabel: "החבילה הנוכחית:",
    specialEducationCategory: "חינוך מיוחד",
    kindergartenCategory: "גני ילדים",
    pendingPaymentTitle: "השלמת תשלום",
    pendingPaymentSubtitle:
      "נבחרה חבילה. להשלמת הרישום יש לבצע תשלום.",
    pendingPaymentRedirectNote:
      "בלחיצה על «תשלום עכשיו» תועברו לדף תשלום מאובטח של SUMIT באותה כרטיסיה.",
    redirectingToPayment: "מעביר לתשלום...",
    paymentComingSoon:
      "תשלום מקוון יהיה זמין בקרוב. ניצור איתכם קשר להשלמת התהליך.",
    payNow: "תשלום עכשיו",
    continueWithoutPayment: "המשך לאזור האישי",
    noPlansTitle: "אין חבילות זמינות",
    noPlansSubtitle:
      "לסוג המוסד שנבחר אין חבילות רכישה זמינות. צרו איתנו קשר.",
    bankTransferHint: "או תשלום בהעברה בנקאית:",
    bankTransferContact: "יצירת קשר לתשלום בהעברה",
    customPlanHint: "בחרו כמה תיקי שילוב/סל אישי וכמה כיתות ח״מ — המחיר יחושב אוטומטית",
    customPlanStudentsLabel: "תיקי שילוב / סל אישי",
  },

  platform: {
    subscriptionsTitle: "ניהול מנויים",
    subscriptionsSubtitle:
      "הפעלה, עדכון וביטול מנויים ללקוחות (תשלום באשראי או העברה בנקאית)",
    subscriptionsNav: "ניהול מנויים",
    activateBank: "הפעל (העברה בנקאית)",
    updatePlan: "עדכן חבילה",
    cancelSubscription: "בטל מנוי",
    removeSubscription: "הסר מנוי",
    billingPricesTitle: "מחירים לחבילה אישית",
    billingPricesSubtitle:
      "מחיר כיתת ח״מ ומחיר תיק שילוב/סל לפי סוג מוסד (בש״ח לשנת לימודים)",
    billingPricesKindergartens: "גני ילדים",
    billingPricesSchools: "בתי ספר",
    billingPricesHighSchools: "תיכונים",
    billingPricesClassLabel: "מחיר כיתת ח״מ",
    billingPricesStudentLabel: "מחיר תיק שילוב/סל",
    billingPricesSave: "שמור מחירים",
    billingPricesSaving: "שומר...",
  },

  common: {
    back: "חזרה",
    edit: "עריכה",
    delete: "מחיקה",
    loading: "טוען...",
    notFound: "לא נמצא",
    footer: "פרוטוקל — המערכת החכמה לניהול תיק חינוך מיוחד",
    copyright: "פרוטוקל",
    allRightsReserved: "",
  },

  pageBySector: {
    kindergartens: {},
    schools: {},
    "high-schools": {},
  },
};

const STORAGE_KEY = "matoah.site-texts";
const META_KEY = "matoah.site-texts.meta";
/** גרסת יישור כיתובים: סדר וניסוח קטגוריות מסגרת */
const STATUS_CAPTION_ALIGN_KEY = "matoah.site-texts.status-caption-align";
/** v9: TZ-69 — «חזרה לרשימת התלמידים» שנדרס לכיתוב צוות */
const STATUS_CAPTION_ALIGN_VERSION = 9;

export function getSiteTexts(): SiteTexts {
  if (typeof window === "undefined") return DEFAULT_SITE_TEXTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SITE_TEXTS;
    return deepMerge(DEFAULT_SITE_TEXTS, JSON.parse(raw) as Partial<SiteTexts>);
  } catch {
    return DEFAULT_SITE_TEXTS;
  }
}

/** Timestamp (ms) of the last local site-text write, if any. */
export function getSiteTextsUpdatedAt(): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(META_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { updatedAt?: number };
    return typeof parsed.updatedAt === "number" ? parsed.updatedAt : null;
  } catch {
    return null;
  }
}

function writeSiteTextsMeta(updatedAt: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(META_KEY, JSON.stringify({ updatedAt }));
}

export function saveSiteTexts(
  texts: SiteTexts,
  opts?: { updatedAt?: number }
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(texts));
  writeSiteTextsMeta(opts?.updatedAt ?? Date.now());
}

export function resetSiteTexts(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(META_KEY);
  window.localStorage.removeItem(STATUS_CAPTION_ALIGN_KEY);
}

const STAFF_CARD_TITLE_HINT =
  /כרטיס\s*איש\s*צוות|בחירת\s*איש\s*צוות|^איש\s*צוות$/;

/**
 * מתקן כיתובים שהוחלפו בין תלמידי שילוב לבין אנשי צוות,
 * כדי שהלוגיקה (תיק תלמיד / רשימת מורות) תישאר על הסטטוס הנכון.
 *
 * חשוב: עדכון גרסה לא דורס כיתובים תקינים בכל האתר — רק תיקונים ממוקדים.
 */
export function alignStaffStudentStatusCaptions(texts: SiteTexts): {
  texts: SiteTexts;
  changed: boolean;
} {
  const d = DEFAULT_SITE_TEXTS;
  const staffHint = /אנשי\s*צוות|צוות\s*החינוך|מורות\s*שילוב|איש\s*צוות/;
  const studentHint = /תלמידי\s*שילוב/;

  const integrationLooksLikeStaff =
    staffHint.test(texts.status.integration) ||
    staffHint.test(texts.status.integrationListTitle);
  const teacherLooksLikeStudents =
    studentHint.test(texts.status.integrationTeacher) &&
    !staffHint.test(texts.status.integrationTeacher);
  const addStudentLooksLikeStaff = staffHint.test(
    texts.personalArea.addStudent
  );
  const studentWizardTitleLooksLikeStaff =
    STAFF_CARD_TITLE_HINT.test(texts.wizard.step1Title.trim()) ||
    texts.wizard.step1Title.trim() === texts.wizard.staffCardTitle.trim();
  const studentCardTitleLooksLikeStaff = STAFF_CARD_TITLE_HINT.test(
    texts.personalArea.studentCardTitle.trim()
  );
  const newStudentTitleLooksLikeStaff = STAFF_CARD_TITLE_HINT.test(
    texts.wizard.newStudentTitle.trim()
  );
  const studentsListLooksLikeStaff = staffHint.test(
    texts.personalArea.backToStudentsList
  );

  let ver = 0;
  if (typeof window !== "undefined") {
    ver = Number(window.localStorage.getItem(STATUS_CAPTION_ALIGN_KEY) || "0");
  }
  const needsVersionBump = ver < STATUS_CAPTION_ALIGN_VERSION;

  const needsMixupFix =
    integrationLooksLikeStaff ||
    teacherLooksLikeStudents ||
    addStudentLooksLikeStaff ||
    studentWizardTitleLooksLikeStaff ||
    studentCardTitleLooksLikeStaff ||
    newStudentTitleLooksLikeStaff ||
    studentsListLooksLikeStaff;

  if (!needsMixupFix && !needsVersionBump) {
    return { texts, changed: false };
  }

  let next: SiteTexts = { ...texts, status: { ...texts.status } };
  let changed = false;
  const touchedPaths: string[] = [];

  function setStatusKey<K extends keyof SiteTexts["status"]>(
    key: K,
    value: SiteTexts["status"][K],
    path: string
  ) {
    if (next.status[key] === value) return;
    next = {
      ...next,
      status: { ...next.status, [key]: value },
    };
    touchedPaths.push(path);
    changed = true;
  }

  function setPersonalAreaKey<K extends keyof SiteTexts["personalArea"]>(
    key: K,
    value: SiteTexts["personalArea"][K],
    path: string
  ) {
    if (next.personalArea[key] === value) return;
    next = {
      ...next,
      personalArea: { ...next.personalArea, [key]: value },
    };
    touchedPaths.push(path);
    changed = true;
  }

  function setWizardKey<K extends keyof SiteTexts["wizard"]>(
    key: K,
    value: SiteTexts["wizard"][K],
    path: string
  ) {
    if (next.wizard[key] === value) return;
    next = {
      ...next,
      wizard: { ...next.wizard, [key]: value },
    };
    touchedPaths.push(path);
    changed = true;
  }

  // תיקון בלבול תלמיד ↔ צוות — רק כשיש חשד אמיתי
  if (integrationLooksLikeStaff) {
    setStatusKey("integration", d.status.integration, "status.integration");
    setStatusKey(
      "integrationListTitle",
      d.status.integrationListTitle,
      "status.integrationListTitle"
    );
  }
  if (teacherLooksLikeStudents) {
    setStatusKey(
      "integrationTeacher",
      d.status.integrationTeacher,
      "status.integrationTeacher"
    );
    setStatusKey(
      "integrationTeacherListTitle",
      d.status.integrationTeacherListTitle,
      "status.integrationTeacherListTitle"
    );
  }
  if (addStudentLooksLikeStaff) {
    setPersonalAreaKey(
      "addStudent",
      d.personalArea.addStudent,
      "personalArea.addStudent"
    );
  }
  if (studentWizardTitleLooksLikeStaff) {
    setWizardKey("step1Title", d.wizard.step1Title, "wizard.step1Title");
  }
  if (studentCardTitleLooksLikeStaff) {
    setPersonalAreaKey(
      "studentCardTitle",
      d.personalArea.studentCardTitle,
      "personalArea.studentCardTitle"
    );
  }
  if (newStudentTitleLooksLikeStaff) {
    setWizardKey(
      "newStudentTitle",
      d.wizard.newStudentTitle,
      "wizard.newStudentTitle"
    );
  }
  if (studentsListLooksLikeStaff) {
    setPersonalAreaKey(
      "backToStudentsList",
      d.personalArea.backToStudentsList,
      "personalArea.backToStudentsList"
    );
  }

  // עדכון גרסה ממוקד — רק ניסוחי צוות ישנים, בלי לדרוס שאר האתר
  if (needsVersionBump) {
    const oldStaffListTitles = /בחרו\s*מורה|בחירת\s*איש\s*צוות|רשימת\s*המורות/;
    const oldAddStaff = /^הוספת\s*איש\s*צוות$/;
    if (oldStaffListTitles.test(next.status.teachersListTitle.trim())) {
      setStatusKey(
        "teachersListTitle",
        d.status.teachersListTitle,
        "status.teachersListTitle"
      );
    }
    if (oldStaffListTitles.test(next.status.teachersRosterTitle.trim())) {
      setStatusKey(
        "teachersRosterTitle",
        d.status.teachersRosterTitle,
        "status.teachersRosterTitle"
      );
    }
    if (
      oldStaffListTitles.test(next.status.integrationTeacherListTitle.trim()) ||
      next.status.integrationTeacherListTitle.trim() === "צוות החינוך המיוחד"
    ) {
      setStatusKey(
        "integrationTeacherListTitle",
        d.status.integrationTeacherListTitle,
        "status.integrationTeacherListTitle"
      );
    }
    if (oldAddStaff.test(next.status.addStaffCard.trim())) {
      setStatusKey("addStaffCard", d.status.addStaffCard, "status.addStaffCard");
    }
    if (staffHint.test(next.personalArea.backToStudentsList.trim())) {
      setPersonalAreaKey(
        "backToStudentsList",
        d.personalArea.backToStudentsList,
        "personalArea.backToStudentsList"
      );
    }
  }

  for (const path of touchedPaths) {
    next = clearSectorOverridesForPath(next, path);
  }

  if (typeof window !== "undefined" && (changed || needsVersionBump)) {
    window.localStorage.setItem(
      STATUS_CAPTION_ALIGN_KEY,
      String(STATUS_CAPTION_ALIGN_VERSION)
    );
  }

  return { texts: next, changed };
}

const PARENT_CAPTION_ALIGN_KEY = "matoah.site-texts.parent-caption-align";
const PARENT_CAPTION_ALIGN_VERSION = 1;

/**
 * מיישר כיתובים של שם אב/אם באשף לכרטיס, ומתקן כששונו בטעות לטלפון/מייל.
 */
export function alignParentNameCaptions(texts: SiteTexts): {
  texts: SiteTexts;
  changed: boolean;
} {
  const d = DEFAULT_SITE_TEXTS;
  const phoneLike = /טל|נייד|פלאפון|phone/i;
  const emailLike = /מייל|דוא|email|mail/i;

  const fatherShortBroken =
    phoneLike.test(texts.wizard.fatherShort) ||
    emailLike.test(texts.wizard.fatherShort);
  const motherShortBroken =
    phoneLike.test(texts.wizard.motherShort) ||
    emailLike.test(texts.wizard.motherShort);

  const fatherCard = texts.studentFields.father.trim() || d.studentFields.father;
  const motherCard = texts.studentFields.mother.trim() || d.studentFields.mother;

  let ver = 0;
  if (typeof window !== "undefined") {
    ver = Number(window.localStorage.getItem(PARENT_CAPTION_ALIGN_KEY) || "0");
  }
  const needsVersionBump = ver < PARENT_CAPTION_ALIGN_VERSION;

  const fatherMismatch =
    texts.wizard.fatherShort.trim() !== fatherCard &&
    (fatherShortBroken || needsVersionBump);
  const motherMismatch =
    texts.wizard.motherShort.trim() !== motherCard &&
    (motherShortBroken || needsVersionBump);

  if (!fatherMismatch && !motherMismatch && !needsVersionBump) {
    return { texts, changed: false };
  }

  let next: SiteTexts = {
    ...texts,
    wizard: {
      ...texts.wizard,
      fatherShort: fatherCard,
      motherShort: motherCard,
    },
  };

  for (const path of ["wizard.fatherShort", "wizard.motherShort"]) {
    next = clearSectorOverridesForPath(next, path);
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      PARENT_CAPTION_ALIGN_KEY,
      String(PARENT_CAPTION_ALIGN_VERSION)
    );
  }

  return { texts: next, changed: true };
}

const CORE_FIELD_CAPTION_ALIGN_KEY = "matoah.site-texts.core-field-caption-align";
const CORE_FIELD_CAPTION_ALIGN_VERSION = 2;

const PHONE_LIKE_CAPTION = /טל|נייד|פלאפון|phone/i;
const DATE_LIKE_CAPTION = /לידה|תאריך|birth|dob/i;
const EMAIL_LIKE_CAPTION = /מייל|דוא|email|mail/i;

type StudentFieldCaptionKey = keyof SiteTexts["studentFields"];

/** כיתוב לא תואם לסוג השדה → מפנים לנתיב הנכון */
const CAPTION_REDIRECTS: Array<{
  from: StudentFieldCaptionKey;
  test: (label: string) => boolean;
  to: StudentFieldCaptionKey;
}> = [
  {
    from: "birthDate",
    test: (label) => PHONE_LIKE_CAPTION.test(label),
    to: "phone",
  },
  {
    from: "birthDate",
    test: (label) => EMAIL_LIKE_CAPTION.test(label),
    to: "email",
  },
  {
    from: "phone",
    test: (label) => DATE_LIKE_CAPTION.test(label),
    to: "birthDate",
  },
  {
    from: "phone",
    test: (label) => EMAIL_LIKE_CAPTION.test(label),
    to: "email",
  },
  {
    from: "email",
    test: (label) => DATE_LIKE_CAPTION.test(label),
    to: "birthDate",
  },
  {
    from: "email",
    test: (label) =>
      PHONE_LIKE_CAPTION.test(label) && !EMAIL_LIKE_CAPTION.test(label),
    to: "phone",
  },
];

function studentFieldPath(key: StudentFieldCaptionKey): string {
  return `studentFields.${key}`;
}

/**
 * שינוי כיתוב שדה ליבה: אם שינו «ת. לידה» ל«טלפון» (וכד') —
 * מעבירים את הכיתוב לשדה הנכון ומחזירים את המקור לברירת מחדל.
 * כך השינוי «באמת» חל על השדה המתאים בכל המערכת.
 */
export function applyStudentFieldCaptionEdit(
  texts: SiteTexts,
  path: string,
  value: string
): { texts: SiteTexts; path: string; value: string } {
  if (!path.startsWith("studentFields.")) {
    return { texts, path, value };
  }
  const key = path.slice("studentFields.".length) as StudentFieldCaptionKey;
  if (!(key in DEFAULT_SITE_TEXTS.studentFields)) {
    return { texts, path, value };
  }

  const nextLabel = value.trim();
  if (!nextLabel) return { texts, path, value };

  const redirect = CAPTION_REDIRECTS.find(
    (rule) => rule.from === key && rule.test(nextLabel)
  );
  if (!redirect) {
    return { texts, path, value: nextLabel };
  }

  const defaults = DEFAULT_SITE_TEXTS.studentFields;
  let next: SiteTexts = {
    ...texts,
    studentFields: {
      ...texts.studentFields,
      [key]: defaults[key],
      [redirect.to]: nextLabel,
    },
  };
  next = clearSectorOverridesForPath(next, studentFieldPath(key));
  next = clearSectorOverridesForPath(next, studentFieldPath(redirect.to));
  return {
    texts: next,
    path: studentFieldPath(redirect.to),
    value: nextLabel,
  };
}

/**
 * מיישר כיתובי ליבה שכבר נשמרו בצורה לא תואמת (למשל ת. לידה → טלפון).
 */
export function alignCoreFieldCaptions(texts: SiteTexts): {
  texts: SiteTexts;
  changed: boolean;
} {
  let next = texts;
  let changed = false;

  for (const rule of CAPTION_REDIRECTS) {
    const current = next.studentFields[rule.from]?.trim() ?? "";
    if (!rule.test(current)) continue;
    const applied = applyStudentFieldCaptionEdit(
      next,
      studentFieldPath(rule.from),
      current
    );
    next = applied.texts;
    changed = true;
  }

  let ver = 0;
  if (typeof window !== "undefined") {
    ver = Number(
      window.localStorage.getItem(CORE_FIELD_CAPTION_ALIGN_KEY) || "0"
    );
  }
  const needsVersionBump = ver < CORE_FIELD_CAPTION_ALIGN_VERSION;
  if (!changed && !needsVersionBump) {
    return { texts, changed: false };
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      CORE_FIELD_CAPTION_ALIGN_KEY,
      String(CORE_FIELD_CAPTION_ALIGN_VERSION)
    );
  }

  return { texts: next, changed: changed || needsVersionBump };
}

const FOOTER_CAPTION_ALIGN_KEY = "matoah.site-texts.footer-caption-align";
const FOOTER_CAPTION_ALIGN_VERSION = 2;

/** פוטר — © שנה + פרוטוקל (במקום מורה דמו / כל הזכויות שמורות) */
export function alignFooterCaptions(texts: SiteTexts): {
  texts: SiteTexts;
  changed: boolean;
} {
  let ver = 0;
  if (typeof window !== "undefined") {
    ver = Number(window.localStorage.getItem(FOOTER_CAPTION_ALIGN_KEY) || "0");
  }
  if (ver >= FOOTER_CAPTION_ALIGN_VERSION) {
    return { texts, changed: false };
  }

  let next: SiteTexts = {
    ...texts,
    common: {
      ...texts.common,
      copyright: DEFAULT_SITE_TEXTS.common.copyright,
      allRightsReserved: DEFAULT_SITE_TEXTS.common.allRightsReserved,
    },
  };
  next = clearSectorOverridesForPath(next, "common.copyright");
  next = clearSectorOverridesForPath(next, "common.allRightsReserved");

  if (typeof window !== "undefined") {
    window.localStorage.setItem(
      FOOTER_CAPTION_ALIGN_KEY,
      String(FOOTER_CAPTION_ALIGN_VERSION)
    );
  }

  return { texts: next, changed: true };
}

const STALE_UPLOAD_LIMIT_RE = /\b(?:2|3(?:\.3)?|8|10)\s*MB\b/i;

/** TZ-139: מחליף כיתובי העלאה ישנים (2 / 3 / 3.3 / 8 / 10MB) לגבול 25MB */
export function alignUploadLimitCaptions(texts: SiteTexts): {
  texts: SiteTexts;
  changed: boolean;
} {
  const nextHint = DEFAULT_SITE_TEXTS.studentDocuments.uploadHint;
  const nextTooLarge = DEFAULT_SITE_TEXTS.studentDocuments.fileTooLarge;
  const hint = texts.studentDocuments.uploadHint;
  const tooLarge = texts.studentDocuments.fileTooLarge;
  const hintStale = STALE_UPLOAD_LIMIT_RE.test(hint) && hint !== nextHint;
  const tooLargeStale =
    STALE_UPLOAD_LIMIT_RE.test(tooLarge) && tooLarge !== nextTooLarge;
  if (!hintStale && !tooLargeStale) {
    return { texts, changed: false };
  }
  return {
    changed: true,
    texts: {
      ...texts,
      studentDocuments: {
        ...texts.studentDocuments,
        uploadHint: hintStale ? nextHint : hint,
        fileTooLarge: tooLargeStale ? nextTooLarge : tooLarge,
      },
    },
  };
}

const FREE_ACCESS_TEN_MINUTES_RE = /10\s*ה?דק/;

/** מחליף כיתובי כניסה חופשית ישנים (10 דקות) ל־20 — תואם FREE_ACCESS_DURATION_MS */
export function alignFreeAccessDurationCaptions(texts: SiteTexts): {
  texts: SiteTexts;
  changed: boolean;
} {
  function bumpTenToTwenty(value: string): string {
    return value
      .replace(/10\s*הדקות/g, "20 הדקות")
      .replace(/10\s*דקות/g, "20 דקות");
  }

  let changed = false;
  const landing = texts.landing;
  const nextLanding: SiteTexts["landing"] = { ...landing };

  for (const key of Object.keys(landing) as (keyof SiteTexts["landing"])[]) {
    const value = landing[key];
    if (typeof value !== "string" || !FREE_ACCESS_TEN_MINUTES_RE.test(value)) {
      continue;
    }
    const bumped = bumpTenToTwenty(value);
    if (bumped === value) continue;
    nextLanding[key] = bumped as SiteTexts["landing"][typeof key];
    changed = true;
  }

  if (!changed) return { texts, changed: false };
  return { texts: { ...texts, landing: nextLanding }, changed: true };
}

export function mergeSiteTexts(base: SiteTexts, patch: Partial<SiteTexts>): SiteTexts {
  return deepMerge(base, patch);
}

function deepMerge<T extends object>(
  base: T | null | undefined,
  patch: Partial<T> | null | undefined
): T {
  const safeBase =
    base && typeof base === "object" && !Array.isArray(base)
      ? base
      : ({} as T);
  const safePatch =
    patch && typeof patch === "object" && !Array.isArray(patch)
      ? patch
      : ({} as Partial<T>);

  const result = { ...safeBase };
  for (const key of Object.keys(safePatch) as (keyof T)[]) {
    const val = safePatch[key];
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const nestedBase = safeBase[key];
      result[key] = deepMerge(
        nestedBase && typeof nestedBase === "object"
          ? (nestedBase as object)
          : {},
        val as object
      ) as T[keyof T];
    } else if (val !== undefined) {
      result[key] = val as T[keyof T];
    }
  }
  return result;
}

export type TextSection = {
  id: string;
  title: string;
  fields: { key: string; label: string; value: string; multiline?: boolean }[];
};

export function flattenTextsForEditor(texts: SiteTexts): TextSection[] {
  return [
    {
      id: "general",
      title: "כללי",
      fields: [
        { key: "appName", label: "שם המערכת", value: texts.appName },
        { key: "appTagline", label: "סלוגן", value: texts.appTagline },
        { key: "common.footer", label: "פוטר", value: texts.common.footer },
        {
          key: "common.copyright",
          label: "שם בפוטר (©)",
          value: texts.common.copyright,
        },
        {
          key: "common.allRightsReserved",
          label: "טקסט נוסף בפוטר (אופציונלי)",
          value: texts.common.allRightsReserved,
        },
      ],
    },
    {
      id: "landing",
      title: "דף כניסה",
      fields: Object.entries(texts.landing).map(([k, v]) => ({
        key: `landing.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "dashboard",
      title: "דשבורד",
      fields: Object.entries(texts.dashboard).map(([k, v]) => ({
        key: `dashboard.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "contact",
      title: "צרו קשר",
      fields: Object.entries(texts.contact).map(([k, v]) => ({
        key: `contact.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "personalArea",
      title: "אזור אישי",
      fields: Object.entries(texts.personalArea).map(([k, v]) => ({
        key: `personalArea.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "categories",
      title: "קטגוריות דשבורד",
      fields: Object.entries(texts.categories).map(([k, v]) => ({
        key: `categories.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "categoryDetail",
      title: "דפי קטגוריה",
      fields: Object.entries(texts.categoryDetail).map(([k, v]) => ({
        key: `categoryDetail.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "tutorials",
      title: "סרטוני הדרכה",
      fields: Object.entries(texts.tutorials).map(([k, v]) => ({
        key: `tutorials.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "status",
      title: "קטגוריות בטבלה (תלמידי שילוב וכו')",
      fields: Object.entries(texts.status).map(([k, v]) => ({
        key: `status.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "studentFields",
      title: "שדות כרטיס תלמיד",
      fields: Object.entries(texts.studentFields).map(([k, v]) => ({
        key: `studentFields.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "studentDocuments",
      title: "מסמכי תלמיד",
      fields: Object.entries(texts.studentDocuments).map(([k, v]) => ({
        key: `studentDocuments.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "studentPortfolio",
      title: "תיק התלמיד",
      fields: Object.entries(texts.studentPortfolio).map(([k, v]) => ({
        key: `studentPortfolio.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "studentCustomFields",
      title: "שדות נוספים בכרטיס תלמיד",
      fields: Object.entries(texts.studentCustomFields).map(([k, v]) => ({
        key: `studentCustomFields.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "studentCard",
      title: "כרטיס תלמיד / איש צוות",
      fields: Object.entries(texts.studentCard).map(([k, v]) => ({
        key: `studentCard.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "auth",
      title: "רישום",
      fields: Object.entries(texts.auth).map(([k, v]) => ({
        key: `auth.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "wizard",
      title: "אשף יצירת תלמיד",
      fields: Object.entries(texts.wizard).map(([k, v]) => ({
        key: `wizard.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "terms",
      title: "תקנון האתר",
      fields: Object.entries(texts.terms).map(([k, v]) => ({
        key: `terms.${k}`,
        label: k,
        value: v,
        multiline: k.includes("Body"),
      })),
    },
    {
      id: "admin",
      title: "הגדרות מנהל",
      fields: Object.entries(texts.admin).map(([k, v]) => ({
        key: `admin.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "billing",
      title: "חבילות ותשלום",
      fields: Object.entries(texts.billing).map(([k, v]) => ({
        key: `billing.${k}`,
        label: k,
        value: v,
      })),
    },
    {
      id: "platform",
      title: "ניהול מנויים",
      fields: Object.entries(texts.platform).map(([k, v]) => ({
        key: `platform.${k}`,
        label: k,
        value: v,
      })),
    },
  ];
}

export function applyTextPatch(
  texts: SiteTexts,
  key: string,
  value: string
): SiteTexts {
  const parts = key.split(".");
  const next = JSON.parse(JSON.stringify(texts)) as SiteTexts;
  let cursor: Record<string, unknown> = next as unknown as Record<
    string,
    unknown
  >;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const child = cursor[part];
    if (child == null || typeof child !== "object" || Array.isArray(child)) {
      cursor[part] = {};
    }
    cursor = cursor[part] as Record<string, unknown>;
  }
  cursor[parts[parts.length - 1]] = value;
  return next;
}

/** מוחק ענף טקסט לפי path (לניקוי כפילויות לפי מגזר) */
export function deleteTextPath(texts: SiteTexts, key: string): SiteTexts {
  const parts = key.split(".").filter(Boolean);
  if (parts.length === 0) return texts;
  const next = JSON.parse(JSON.stringify(texts)) as SiteTexts;
  let cursor: Record<string, unknown> = next as unknown as Record<
    string,
    unknown
  >;
  for (let i = 0; i < parts.length - 1; i++) {
    const child = cursor[parts[i]];
    if (child == null || typeof child !== "object" || Array.isArray(child)) {
      return next;
    }
    cursor = child as Record<string, unknown>;
  }
  delete cursor[parts[parts.length - 1]];
  return next;
}

const SECTOR_KEYS = ["kindergartens", "schools", "high-schools"] as const;

/** אחרי עריכת כיתוב גלובלית — מסיר עותקי מגזר ישנים שמצלים על השינוי */
export function clearSectorOverridesForPath(
  texts: SiteTexts,
  path: string
): SiteTexts {
  let next = texts;
  for (const sector of SECTOR_KEYS) {
    next = deleteTextPath(next, `pageBySector.${sector}.${path}`);
  }
  return next;
}
