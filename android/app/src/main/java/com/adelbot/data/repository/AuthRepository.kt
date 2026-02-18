package com.adelbot.data.repository

import com.adelbot.data.api.AdelBotApi
import com.adelbot.data.local.TokenManager
import com.adelbot.data.model.GitHubAuthRequest
import com.adelbot.data.model.TokenResponse
import com.adelbot.data.model.UserResponse
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    private val api: AdelBotApi,
    private val tokenManager: TokenManager
) {
    suspend fun getGitHubAuthUrl(): String {
        val response = api.getGitHubAuthUrl()
        return response.url
    }

    suspend fun authenticateWithCode(code: String): TokenResponse {
        val response = api.authenticateWithGitHub(GitHubAuthRequest(code))
        tokenManager.saveAuthData(
            token = response.accessToken,
            userId = response.user.id,
            username = response.user.githubUsername,
            avatarUrl = response.user.avatarUrl
        )
        return response
    }

    suspend fun getCurrentUser(): UserResponse = api.getMe()

    suspend fun isLoggedIn(): Boolean = tokenManager.isLoggedIn()

    suspend fun logout() = tokenManager.clearAuthData()
}
