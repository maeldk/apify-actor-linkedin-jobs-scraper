import type { ApiJob, CompanyInfo } from './apiClient.js';
import type { ParsedDetail } from './detailParser.js';

export const DRIFT_MAPPED: Record<string, string[]> = {
  apiJob: [
    'jobId',
    'urn',
    'title',
    'company',
    'companyUrl',
    'location',
    'postedAtIso',
    'jobUrl',
    'trackingId',
    'isPromoted',
    'isEasyApplyOnCard',
    'postingBenefits',
  ],
  detail: [
    'description',
    'descriptionHtml',
    'seniorityLevel',
    'employmentType',
    'jobFunction',
    'industry',
    'applicantCount',
    'workplaceType',
    'postedRelative',
    'salary',
    'poster',
  ],
  companyInfo: [
    'name',
    'description',
    'slogan',
    'website',
    'employeeCount',
    'logo',
    'address',
  ],
};

export const DRIFT_ACK: Record<string, string[]> = {
  apiJob: [],
  detail: [],
  companyInfo: [],
};

export type SourceObserver = (layer: string, record: unknown) => void;

export function observeApiJob(record: ApiJob | ApiJob[], observe: SourceObserver): void {
  observe('apiJob', record);
}

export function observeDetail(record: ParsedDetail, observe: SourceObserver): void {
  observe('detail', record);
}

export function observeCompanyInfo(record: CompanyInfo, observe: SourceObserver): void {
  observe('companyInfo', record);
}
