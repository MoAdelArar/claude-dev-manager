package com.adelbot.ui.screens

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.adelbot.data.local.TokenManager
import com.adelbot.data.model.WebSocketEvent
import com.adelbot.data.repository.SessionRepository
import com.adelbot.ui.theme.*
import com.adelbot.util.SessionWebSocketClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LiveEvent(
    val type: String,
    val content: String,
    val timestamp: String? = null
)

data class SessionLiveUiState(
    val isConnected: Boolean = false,
    val sessionStatus: String = "connecting",
    val events: List<LiveEvent> = emptyList(),
    val commitSha: String? = null,
    val duration: Double? = null,
    val cost: Int? = null,
    val errorMessage: String? = null,
    val isComplete: Boolean = false
)

@HiltViewModel
class SessionLiveViewModel @Inject constructor(
    private val tokenManager: TokenManager,
    private val sessionRepository: SessionRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(SessionLiveUiState())
    val uiState: StateFlow<SessionLiveUiState> = _uiState.asStateFlow()

    private var wsClient: SessionWebSocketClient? = null

    fun connect(sessionId: String) {
        viewModelScope.launch {
            val token = tokenManager.getAccessToken() ?: return@launch
            wsClient = SessionWebSocketClient(sessionId, token)

            launch {
                wsClient?.events?.collect { event ->
                    handleEvent(event)
                }
            }

            wsClient?.connect()
        }
    }

    private fun handleEvent(event: WebSocketEvent) {
        when (event.type) {
            "connected" -> {
                _uiState.value = _uiState.value.copy(isConnected = true)
                addEvent("system", "Connected to session")
            }
            "event" -> {
                val content = event.content ?: ""
                addEvent(event.eventType ?: "info", content)
            }
            "status" -> {
                _uiState.value = _uiState.value.copy(sessionStatus = event.status ?: "unknown")
            }
            "session_ended" -> {
                _uiState.value = _uiState.value.copy(
                    isComplete = true,
                    sessionStatus = event.status ?: "completed",
                    commitSha = event.commitSha,
                    duration = event.durationSeconds,
                    cost = event.costCents,
                    errorMessage = event.errorMessage
                )
                addEvent("system", "Session ended: ${event.status}")
            }
            "disconnected" -> {
                _uiState.value = _uiState.value.copy(isConnected = false)
                addEvent("system", "Disconnected")
            }
            "error" -> {
                addEvent("error", event.content ?: "Unknown error")
            }
        }
    }

    private fun addEvent(type: String, content: String) {
        val current = _uiState.value.events.toMutableList()
        current.add(LiveEvent(type = type, content = content))
        _uiState.value = _uiState.value.copy(events = current)
    }

    fun cancelSession(sessionId: String) {
        viewModelScope.launch {
            try { sessionRepository.cancelSession(sessionId) } catch (_: Exception) {}
        }
    }

    override fun onCleared() {
        super.onCleared()
        wsClient?.disconnect()
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SessionLiveScreen(
    sessionId: String,
    onBack: () -> Unit,
    viewModel: SessionLiveViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val listState = rememberLazyListState()

    LaunchedEffect(sessionId) { viewModel.connect(sessionId) }

    LaunchedEffect(uiState.events.size) {
        if (uiState.events.isNotEmpty()) {
            listState.animateScrollToItem(uiState.events.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (!uiState.isComplete) {
                            Surface(
                                shape = CircleShape,
                                color = if (uiState.isConnected) AdelSuccess else AdelWarning,
                                modifier = Modifier.size(8.dp)
                            ) {}
                            Spacer(modifier = Modifier.width(8.dp))
                        }
                        Column {
                            Text(
                                text = if (uiState.isComplete) "Session Complete" else "Claude Code",
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp
                            )
                            Text(
                                text = uiState.sessionStatus.replace("_", " "),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f),
                                fontSize = 11.sp
                            )
                        }
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (!uiState.isComplete) {
                        IconButton(onClick = { viewModel.cancelSession(sessionId) }) {
                            Icon(Icons.Filled.Stop, contentDescription = "Cancel", tint = AdelError)
                        }
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            AnimatedVisibility(visible = !uiState.isComplete && uiState.sessionStatus != "connecting") {
                ClaudeCodeStatusBar(status = uiState.sessionStatus)
            }

            AnimatedVisibility(visible = uiState.isComplete) {
                CompletionCard(
                    status = uiState.sessionStatus,
                    commitSha = uiState.commitSha,
                    duration = uiState.duration,
                    cost = uiState.cost,
                    errorMessage = uiState.errorMessage
                )
            }

            LazyColumn(
                state = listState,
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color(0xFF0D1117)),
                contentPadding = PaddingValues(8.dp),
                verticalArrangement = Arrangement.spacedBy(2.dp)
            ) {
                items(uiState.events) { event ->
                    ClaudeCodeEventRow(event)
                }

                if (!uiState.isComplete && uiState.events.isNotEmpty()) {
                    item {
                        Row(
                            modifier = Modifier.padding(vertical = 8.dp, horizontal = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(12.dp),
                                strokeWidth = 1.5.dp,
                                color = AdelPrimary
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "Claude Code is working...",
                                style = MaterialTheme.typography.bodySmall,
                                color = Color(0xFF8B949E),
                                fontFamily = FontFamily.Monospace,
                                fontSize = 11.sp
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ClaudeCodeStatusBar(status: String) {
    val (color, label) = when (status) {
        "running" -> Pair(AdelPrimary, "Container Ready")
        "agent_working" -> Pair(AdelPrimary, "Claude Code Running")
        "provisioning" -> Pair(AdelWarning, "Setting Up Container")
        "pushing" -> Pair(AdelSecondary, "Pushing to GitHub")
        else -> Pair(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.5f), status)
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = color.copy(alpha = 0.08f)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(14.dp),
                strokeWidth = 2.dp,
                color = color
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelMedium,
                fontWeight = FontWeight.SemiBold,
                color = color,
                fontFamily = FontFamily.Default,
                fontSize = 13.sp
            )
        }
    }
}

@Composable
private fun CompletionCard(
    status: String,
    commitSha: String?,
    duration: Double?,
    cost: Int?,
    errorMessage: String?
) {
    val isSuccess = status == "completed"

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(8.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isSuccess) AdelSuccess.copy(alpha = 0.1f)
            else AdelError.copy(alpha = 0.1f)
        )
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    if (isSuccess) Icons.Filled.CheckCircle else Icons.Filled.Error,
                    contentDescription = null,
                    tint = if (isSuccess) AdelSuccess else AdelError,
                    modifier = Modifier.size(22.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isSuccess) "Claude Code Completed" else "Claude Code Failed",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold,
                    color = if (isSuccess) AdelSuccess else AdelError
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                if (commitSha != null) {
                    CompactChip(Icons.Filled.Check, commitSha.take(7), AdelSuccess)
                }
                if (duration != null) {
                    CompactChip(Icons.Filled.Timer, formatDuration(duration), AdelPrimary)
                }
                if (cost != null && cost > 0) {
                    CompactChip(Icons.Filled.AttachMoney, "$${cost / 100.0}", AdelWarning)
                }
            }

            if (errorMessage != null) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = errorMessage,
                    style = MaterialTheme.typography.bodySmall,
                    color = AdelError,
                    maxLines = 3
                )
            }
        }
    }
}

@Composable
private fun CompactChip(icon: ImageVector, text: String, color: Color) {
    Row(verticalAlignment = Alignment.CenterVertically) {
        Icon(icon, contentDescription = null, modifier = Modifier.size(13.dp), tint = color)
        Spacer(modifier = Modifier.width(3.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall.copy(
                fontFamily = FontFamily.Monospace, fontSize = 11.sp
            ),
            color = color
        )
    }
}

@Composable
private fun ClaudeCodeEventRow(event: LiveEvent) {
    val isToolAction = event.type == "agent_action"
    val isOutput = event.type == "command_output"
    val isError = event.type == "error"
    val isMessage = event.type == "agent_message"
    val isSystem = event.type in listOf("system", "status_change")

    val (icon, color, bgAlpha) = when {
        isToolAction && event.content.startsWith("[Bash") ->
            Triple(Icons.Filled.Terminal, AdelWarning, 0.06f)
        isToolAction && (event.content.startsWith("[Read") || event.content.startsWith("[Write") || event.content.startsWith("[Edit")) ->
            Triple(Icons.Filled.Edit, AdelSecondary, 0.06f)
        isToolAction && event.content.startsWith("[Search") ->
            Triple(Icons.Filled.Search, AdelPrimary, 0.06f)
        isToolAction ->
            Triple(Icons.Filled.Build, AdelPrimary, 0.06f)
        isOutput ->
            Triple(Icons.Filled.Code, Color(0xFF6E7681), 0.04f)
        isError ->
            Triple(Icons.Filled.Error, AdelError, 0.08f)
        isMessage ->
            Triple(Icons.Filled.SmartToy, Color(0xFFC9D1D9), 0.0f)
        isSystem ->
            Triple(Icons.Filled.Info, Color(0xFF484F58), 0.0f)
        else ->
            Triple(Icons.Filled.Circle, Color(0xFF6E7681), 0.0f)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(4.dp))
            .background(color.copy(alpha = bgAlpha))
            .padding(horizontal = 6.dp, vertical = 3.dp),
        verticalAlignment = Alignment.Top
    ) {
        Icon(
            icon,
            contentDescription = null,
            modifier = Modifier
                .size(13.dp)
                .padding(top = 2.dp),
            tint = color
        )
        Spacer(modifier = Modifier.width(6.dp))

        if (isOutput) {
            Text(
                text = event.content,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = FontFamily.Monospace,
                    fontSize = 10.sp,
                    lineHeight = 14.sp
                ),
                color = Color(0xFF8B949E),
                maxLines = 15,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.horizontalScroll(rememberScrollState())
            )
        } else {
            Text(
                text = event.content,
                style = MaterialTheme.typography.bodySmall.copy(
                    fontFamily = if (isToolAction || isOutput) FontFamily.Monospace else FontFamily.Default,
                    fontSize = if (isMessage) 12.sp else 11.sp,
                    lineHeight = if (isMessage) 17.sp else 15.sp
                ),
                color = if (isMessage) Color(0xFFE6EDF3) else color,
                maxLines = if (isToolAction) 3 else 20,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}

private fun formatDuration(seconds: Double): String {
    val mins = (seconds / 60).toInt()
    val secs = (seconds % 60).toInt()
    return if (mins > 0) "${mins}m ${secs}s" else "${secs}s"
}
