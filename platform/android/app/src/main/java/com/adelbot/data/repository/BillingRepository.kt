package com.adelbot.data.repository

import com.adelbot.data.api.AdelBotApi
import com.adelbot.data.model.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class BillingRepository @Inject constructor(
    private val api: AdelBotApi
) {
    suspend fun getUsage(): UsageSummary = api.getUsage()

    suspend fun getBillingHistory(limit: Int = 50, offset: Int = 0): List<BillingRecord> {
        return api.getBillingHistory(limit, offset)
    }

    suspend fun getPlans(): List<PlanInfo> = api.getPlans()
}
