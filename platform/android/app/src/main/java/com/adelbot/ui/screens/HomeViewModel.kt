package com.adelbot.ui.screens

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.adelbot.data.local.TokenManager
import com.adelbot.data.model.SessionResponse
import com.adelbot.data.repository.AuthRepository
import com.adelbot.data.repository.BillingRepository
import com.adelbot.data.repository.RepoRepository
import com.adelbot.data.repository.SessionRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val isLoading: Boolean = false,
    val username: String? = null,
    val avatarUrl: String? = null,
    val totalSessions: Int = 0,
    val totalMinutes: Double = 0.0,
    val repoCount: Int = 0,
    val recentSessions: List<SessionResponse> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val repoRepository: RepoRepository,
    private val sessionRepository: SessionRepository,
    private val billingRepository: BillingRepository,
    private val tokenManager: TokenManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    fun loadDashboard() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                isLoading = true,
                username = tokenManager.username.first(),
                avatarUrl = tokenManager.avatarUrl.first()
            )

            try {
                val repos = try { repoRepository.getRepositories() } catch (_: Exception) { emptyList() }
                val sessions = try { sessionRepository.getSessions(limit = 5) } catch (_: Exception) { null }
                val usage = try { billingRepository.getUsage() } catch (_: Exception) { null }

                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    repoCount = repos.size,
                    totalSessions = usage?.totals?.totalSessions ?: sessions?.total ?: 0,
                    totalMinutes = usage?.totals?.totalMinutes ?: 0.0,
                    recentSessions = sessions?.sessions ?: emptyList()
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message
                )
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            authRepository.logout()
        }
    }
}
