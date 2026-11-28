import { test } from "node:test";
import assert from "node:assert/strict";
import { cappedCommissionCents, commissionCampaignWindow, evaluateCommission, normalizePromoterCode, type CommissionEvidence } from "./promoter-policy";

const code = "P" + "A".repeat(24);
const valid: CommissionEvidence = {
  promoterApproved:true,eligibilityVerified:true,referralCode:code,attributedCode:code,
  provider:"whop",paymentId:"pay_verified",paymentVerified:true,livePayment:true,refunded:false,
  amountCents:200,currency:"USD",product:"motion-card",
};
test("qualifying optional two-dollar motion purchase earns 96 cents",()=>assert.equal(evaluateCommission(valid).commissionCents,96));
for(const [name,patch] of Object.entries({
  refunded:{refunded:true}, unverified:{paymentVerified:false}, testPayment:{livePayment:false},
  unapproved:{promoterApproved:false}, ineligible:{eligibilityVerified:false},
  wrongReferral:{attributedCode:"P"+"B".repeat(24)}, wrongPrice:{amountCents:201},
  wrongCurrency:{currency:"EUR"}, missingPayment:{paymentId:""},
})) {
  test(`commission excludes ${name}`,()=>assert.equal(evaluateCommission({...valid,...patch}).eligible,false));
}
test("caps use integer cents and shared daily and campaign ceilings",()=>{
  assert.equal(cappedCommissionCents(96,0,0),96);
  assert.equal(cappedCommissionCents(96,9590,0),10);
  assert.equal(cappedCommissionCents(96,0,95990),10);
  assert.equal(cappedCommissionCents(96,9600,0),0);
  assert.equal(cappedCommissionCents(96,0,96000),0);
  assert.equal(cappedCommissionCents(96,-1,0),0);
  assert.equal(cappedCommissionCents(1.5,0,0),0);
});
test("merchandise commission requires approved shirts and verified eligible profit",()=>{
  assert.equal(evaluateCommission({...valid,product:"merchandise",amountCents:2000}).eligible,false);
  assert.equal(evaluateCommission({...valid,product:"merchandise",amountCents:2000,approvedShirtOrder:true,eligibleProfitCents:1000}).commissionCents,480);
});
test("referral codes normalize without accepting arbitrary request values",()=>{
  assert.equal(normalizePromoterCode(` ${code.toLowerCase()} `),code);
  assert.equal(normalizePromoterCode({code}),null);
  assert.equal(normalizePromoterCode("Pinvalid"),null);
});
test("missing or ambiguous campaign accounting settings fail closed",()=>{
  assert.equal(commissionCampaignWindow({}),null);
  assert.equal(commissionCampaignWindow({PROMOTER_CAMPAIGN_START_AT:"2026-12-07",PROMOTER_CAMPAIGN_END_AT:"2026-12-17",PROMOTER_CAMPAIGN_TIMEZONE:"America/Chicago"}),null);
  assert.equal(commissionCampaignWindow({PROMOTER_CAMPAIGN_START_AT:"2026-12-17T00:00:00Z",PROMOTER_CAMPAIGN_END_AT:"2026-12-07T00:00:00Z",PROMOTER_CAMPAIGN_TIMEZONE:"America/Chicago"}),null);
  assert.equal(commissionCampaignWindow({PROMOTER_CAMPAIGN_START_AT:"2026-12-07T00:00:00Z",PROMOTER_CAMPAIGN_END_AT:"2026-12-17T00:00:00Z",PROMOTER_CAMPAIGN_TIMEZONE:"invalid/timezone"}),null);
});
test("explicit campaign instants and timezone can be validated without choosing owner rules",()=>{
  const window = commissionCampaignWindow({PROMOTER_CAMPAIGN_START_AT:"2026-12-07T15:00:00Z",PROMOTER_CAMPAIGN_END_AT:"2026-12-16T22:00:00Z",PROMOTER_CAMPAIGN_TIMEZONE:"America/Chicago"});
  assert.equal(window?.startAt.toISOString(),"2026-12-07T15:00:00.000Z");
});
