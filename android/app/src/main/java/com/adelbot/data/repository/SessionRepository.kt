package com.adelbot.data.repository

import com.adelbot.data.api.AdelBotApi
import com.adelbot.data.model.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SessionRepository @Inject constructor(
    private val api: AdelBotApi
) {
    suspend fun createSession(
        repositoryId: String,
        taskDescription: String,
        branch: String? = null
    ): SessionResponse {
        return api.createSession(
            CreateSessionRequest(
                repositoryId = repositoryId,
                taskDescription = taskDescription,
                branch = branch
            )
        )
    }

    suspend fun getSessions(limit: Int = 20, offset: Int = 0): SessionListResponse {
        return api.getSessions(limit, offset)
    }

    suspend fun getSession(sessionId: String): SessionResponse {
        return api.getSession(sessionId)
    }

    suspend fun getSessionEvents(sessionId: String): List<SessionEventResponse> {
        return api.getSessionEvents(sessionId)
    }

    suspend fun cancelSession(sessionId: String): SessionResponse {
        return api.cancelSession(sessionId)
    }
}
