import studentInfo from "./student-info.json";
import personalBasketCard from "./personal-basket-card.json";
import waiverConfidentiality from "./waiver-confidentiality.json";
import waiverEligibilityCharacterization from "./waiver-eligibility-characterization.json";
import waiverMultidisciplinaryTeam from "./waiver-multidisciplinary-team.json";
import waiverAppealCommittee from "./waiver-appeal-committee.json";
import referralQuestionnaire from "./referral-questionnaire.json";
import referralQuestionnaireMultidisciplinary from "./referral-questionnaire-multidisciplinary.json";
import referralQuestionnaireKindergarten from "./referral-questionnaire-kindergarten.json";
import parentQuestionnaire from "./parent-questionnaire.json";
import studentQuestionnaire from "./student-questionnaire.json";
import tachiPrep from "./tachi-prep.json";
import schedule from "./schedule.json";
import staffSchedule from "./staff-schedule.json";
import dailyLearningPlan from "./daily-learning-plan.json";
import tachi from "./tachi.json";
import tachiIntegrative from "./tachi-integrative.json";
import accommodations from "./accommodations.json";
import formativeAssessmentTable from "./formative-assessment-table.json";
import formativeAssessmentVerbal from "./formative-assessment-verbal.json";
import summativeAssessmentTable from "./summative-assessment-table.json";
import summativeAssessmentVerbal from "./summative-assessment-verbal.json";
import expertGuidance from "./expert-guidance.json";
import staffMeetings from "./staff-meetings.json";
import parentConversations from "./parent-conversations.json";
import externalCorrespondence from "./external-correspondence.json";
import tlaPrep from "./tla-prep.json";
import tlaPresentation from "./tla-presentation.json";
import parentQuestionnaireTla from "./parent-questionnaire-tla.json";
import tla from "./tla.json";
import tlaIntegrative from "./tla-integrative.json";
import studentTeamDetails from "./student-team-details.json";
import classStudentList from "./class-student-list.json";
import learningClusters from "./learning-clusters.json";
import classProfile from "./class-profile.json";
import tlkSummary from "./tlk-summary.json";
import classTeachingPlan from "./class-teaching-plan.json";
import adaptedCurriculum from "./adapted-curriculum.json";
import weeklySchedule from "./weekly-schedule.json";
import paramedicalSchedule from "./paramedical-schedule.json";
import inclusionSchedule from "./inclusion-schedule.json";
import tlkPersonalSchedule from "./tlk-personal-schedule.json";
import personalSchedule from "./personal-schedule.json";
import scheduleDetailed from "./schedule-detailed.json";
import inclusionPlan from "./inclusion-plan.json";
import inclusionMeetings from "./inclusion-meetings.json";
import moePsychologistRecommendation from "./moe-psychologist-recommendation.json";
import moePsychologistCodeChange from "./moe-psychologist-code-change.json";
import moeParentApprovalCommitteeNoPresence from "./moe-parent-approval-committee-no-presence.json";
import moeEligibilityRenewal from "./moe-eligibility-renewal.json";
import moeSchoolWebsitePhotoConsent from "./moe-school-website-photo-consent.json";
import moeExhaustOptions from "./moe-exhaust-options.json";
import moeParentQuestionnaireAlt from "./moe-parent-questionnaire-alt.json";
import moeInclusionPlan from "./moe-inclusion-plan.json";
import functionalEducationalReport from "./functional-educational-report.json";

export const FORM_SCHEMA_JSON_FILES: { fileName: string; data: unknown }[] = [
  { fileName: "student-info.json", data: studentInfo },
  { fileName: "personal-basket-card.json", data: personalBasketCard },
  { fileName: "waiver-confidentiality.json", data: waiverConfidentiality },
  { fileName: "waiver-eligibility-characterization.json", data: waiverEligibilityCharacterization },
  { fileName: "waiver-multidisciplinary-team.json", data: waiverMultidisciplinaryTeam },
  { fileName: "waiver-appeal-committee.json", data: waiverAppealCommittee },
  { fileName: "referral-questionnaire.json", data: referralQuestionnaire },
  { fileName: "referral-questionnaire-multidisciplinary.json", data: referralQuestionnaireMultidisciplinary },
  { fileName: "referral-questionnaire-kindergarten.json", data: referralQuestionnaireKindergarten },
  { fileName: "parent-questionnaire.json", data: parentQuestionnaire },
  { fileName: "student-questionnaire.json", data: studentQuestionnaire },
  { fileName: "tachi-prep.json", data: tachiPrep },
  { fileName: "schedule.json", data: schedule },
  { fileName: "staff-schedule.json", data: staffSchedule },
  { fileName: "daily-learning-plan.json", data: dailyLearningPlan },
  { fileName: "tachi.json", data: tachi },
  { fileName: "tachi-integrative.json", data: tachiIntegrative },
  { fileName: "accommodations.json", data: accommodations },
  { fileName: "formative-assessment-table.json", data: formativeAssessmentTable },
  { fileName: "formative-assessment-verbal.json", data: formativeAssessmentVerbal },
  { fileName: "summative-assessment-table.json", data: summativeAssessmentTable },
  { fileName: "summative-assessment-verbal.json", data: summativeAssessmentVerbal },
  { fileName: "expert-guidance.json", data: expertGuidance },
  { fileName: "staff-meetings.json", data: staffMeetings },
  { fileName: "parent-conversations.json", data: parentConversations },
  { fileName: "external-correspondence.json", data: externalCorrespondence },
  { fileName: "tla-prep.json", data: tlaPrep },
  { fileName: "tla-presentation.json", data: tlaPresentation },
  { fileName: "parent-questionnaire-tla.json", data: parentQuestionnaireTla },
  { fileName: "tla.json", data: tla },
  { fileName: "tla-integrative.json", data: tlaIntegrative },
  { fileName: "student-team-details.json", data: studentTeamDetails },
  { fileName: "class-student-list.json", data: classStudentList },
  { fileName: "learning-clusters.json", data: learningClusters },
  { fileName: "class-profile.json", data: classProfile },
  { fileName: "tlk-summary.json", data: tlkSummary },
  { fileName: "class-teaching-plan.json", data: classTeachingPlan },
  { fileName: "adapted-curriculum.json", data: adaptedCurriculum },
  { fileName: "weekly-schedule.json", data: weeklySchedule },
  { fileName: "paramedical-schedule.json", data: paramedicalSchedule },
  { fileName: "inclusion-schedule.json", data: inclusionSchedule },
  { fileName: "tlk-personal-schedule.json", data: tlkPersonalSchedule },
  { fileName: "personal-schedule.json", data: personalSchedule },
  { fileName: "schedule-detailed.json", data: scheduleDetailed },
  { fileName: "inclusion-plan.json", data: inclusionPlan },
  { fileName: "inclusion-meetings.json", data: inclusionMeetings },
  { fileName: "moe-psychologist-recommendation.json", data: moePsychologistRecommendation },
  { fileName: "moe-psychologist-code-change.json", data: moePsychologistCodeChange },
  { fileName: "moe-parent-approval-committee-no-presence.json", data: moeParentApprovalCommitteeNoPresence },
  { fileName: "moe-eligibility-renewal.json", data: moeEligibilityRenewal },
  {
    fileName: "moe-school-website-photo-consent.json",
    data: moeSchoolWebsitePhotoConsent,
  },
  { fileName: "moe-exhaust-options.json", data: moeExhaustOptions },
  { fileName: "moe-parent-questionnaire-alt.json", data: moeParentQuestionnaireAlt },
  { fileName: "moe-inclusion-plan.json", data: moeInclusionPlan },
  { fileName: "functional-educational-report.json", data: functionalEducationalReport },
];
