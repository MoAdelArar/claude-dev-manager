package com.adelbot.data.api

import com.adelbot.data.model.*
import retrofit2.http.*

interface AdelBotApi {

    @GET("api/v1/auth/github/url")
    suspend fun getGitHubAuthUrl(): AuthUrlResponse

    @POST("api/v1/auth/github/callback")
    suspend fun authenticateWithGitHub(@Body request: GitHubAuthRequest): TokenResponse

    @GET("api/v1/auth/me")
    suspend fun getMe(): UserResponse

    @POST("api/v1/auth/refresh")
    suspend fun refreshToken(): TokenResponse

    @GET("api/v1/repositories/")
    suspend fun getRepositories(): List<Repository>

    @POST("api/v1/repositories/sync")
    suspend fun syncRepositories(): List<Repository>

    @GET("api/v1/repositories/{repoId}")
    suspend fun getRepository(@Path("repoId") repoId: String): Repository

    @GET("api/v1/repositories/{repoId}/branches")
    suspend fun getBranches(@Path("repoId") repoId: String): List<Branch>

    @POST("api/v1/sessions/")
    suspend fun createSession(@Body request: CreateSessionRequest): SessionResponse

    @GET("api/v1/sessions/")
    suspend fun getSessions(
        @Query("limit") limit: Int = 20,
        @Query("offset") offset: Int = 0
    ): SessionListResponse

    @GET("api/v1/sessions/{sessionId}")
    suspend fun getSession(@Path("sessionId") sessionId: String): SessionResponse

    @GET("api/v1/sessions/{sessionId}/events")
    suspend fun getSessionEvents(@Path("sessionId") sessionId: String): List<SessionEventResponse>

    @POST("api/v1/sessions/{sessionId}/cancel")
    suspend fun cancelSession(@Path("sessionId") sessionId: String): SessionResponse

    @GET("api/v1/billing/usage")
    suspend fun getUsage(): UsageSummary

    @GET("api/v1/billing/history")
    suspend fun getBillingHistory(
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0
    ): List<BillingRecord>

    @GET("api/v1/billing/subscription")
    suspend fun getSubscription(): Map<String, Any>

    @GET("api/v1/billing/plans")
    suspend fun getPlans(): List<PlanInfo>
}
