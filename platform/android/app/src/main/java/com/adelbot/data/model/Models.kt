package com.adelbot.data.model

import com.google.gson.annotations.SerializedName

data class AuthUrlResponse(
    val url: String,
    val state: String
)

data class GitHubAuthRequest(
    val code: String
)

data class TokenResponse(
    @SerializedName("access_token") val accessToken: String,
    @SerializedName("token_type") val tokenType: String,
    val user: UserResponse
)

data class UserResponse(
    val id: String,
    @SerializedName("github_username") val githubUsername: String,
    val email: String?,
    @SerializedName("avatar_url") val avatarUrl: String?,
    @SerializedName("display_name") val displayName: String?
)

data class Repository(
    val id: String,
    @SerializedName("github_repo_id") val githubRepoId: Int,
    @SerializedName("full_name") val fullName: String,
    val name: String,
    val description: String?,
    @SerializedName("default_branch") val defaultBranch: String,
    val language: String?,
    @SerializedName("is_private") val isPrivate: Boolean,
    @SerializedName("clone_url") val cloneUrl: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String
)

data class Branch(
    val name: String,
    val sha: String
)

data class CreateSessionRequest(
    @SerializedName("repository_id") val repositoryId: String,
    @SerializedName("task_description") val taskDescription: String,
    val branch: String?,
    @SerializedName("execution_mode") val executionMode: String = "claude" // "claude" or "cdm"
)

data class SessionResponse(
    val id: String,
    @SerializedName("repository_id") val repositoryId: String,
    val status: String,
    val branch: String,
    @SerializedName("task_description") val taskDescription: String,
    @SerializedName("container_id") val containerId: String?,
    @SerializedName("started_at") val startedAt: String?,
    @SerializedName("ended_at") val endedAt: String?,
    @SerializedName("duration_seconds") val durationSeconds: Double?,
    @SerializedName("cost_cents") val costCents: Int,
    @SerializedName("tokens_used") val tokensUsed: Int,
    @SerializedName("commit_sha") val commitSha: String?,
    @SerializedName("commit_message") val commitMessage: String?,
    @SerializedName("files_changed") val filesChanged: Int?,
    @SerializedName("error_message") val errorMessage: String?,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String
)

data class SessionListResponse(
    val sessions: List<SessionResponse>,
    val total: Int
)

data class SessionEventResponse(
    val id: String,
    @SerializedName("session_id") val sessionId: String,
    @SerializedName("event_type") val eventType: String,
    val sequence: Int,
    val content: String,
    @SerializedName("metadata_json") val metadataJson: String?,
    val timestamp: String
)

data class UsageSummary(
    val subscription: SubscriptionInfo,
    val totals: UsageTotals
)

data class SubscriptionInfo(
    val tier: String,
    @SerializedName("is_active") val isActive: Boolean,
    @SerializedName("minutes_used_this_period") val minutesUsedThisPeriod: Double,
    @SerializedName("minutes_limit") val minutesLimit: Int,
    @SerializedName("max_concurrent_sessions") val maxConcurrentSessions: Int,
    @SerializedName("current_period_start") val currentPeriodStart: String?,
    @SerializedName("current_period_end") val currentPeriodEnd: String?
)

data class UsageTotals(
    @SerializedName("total_spent_cents") val totalSpentCents: Int,
    @SerializedName("total_sessions") val totalSessions: Int,
    @SerializedName("total_minutes") val totalMinutes: Double
)

data class BillingRecord(
    val id: String,
    @SerializedName("billing_type") val billingType: String,
    @SerializedName("amount_cents") val amountCents: Int,
    val description: String,
    @SerializedName("created_at") val createdAt: String
)

data class PlanInfo(
    val tier: String,
    @SerializedName("price_cents_monthly") val priceCentsMonthly: Int,
    @SerializedName("minutes_per_month") val minutesPerMonth: Int,
    @SerializedName("max_concurrent_sessions") val maxConcurrentSessions: Int
)

data class WebSocketEvent(
    val type: String,
    @SerializedName("event_type") val eventType: String? = null,
    val content: String? = null,
    val status: String? = null,
    val sequence: Int? = null,
    val timestamp: String? = null,
    @SerializedName("commit_sha") val commitSha: String? = null,
    @SerializedName("duration_seconds") val durationSeconds: Double? = null,
    @SerializedName("cost_cents") val costCents: Int? = null,
    @SerializedName("error_message") val errorMessage: String? = null
)
