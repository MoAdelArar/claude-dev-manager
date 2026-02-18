package com.adelbot.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.adelbot.data.model.Branch
import com.adelbot.data.model.Repository
import com.adelbot.data.repository.RepoRepository
import com.adelbot.data.repository.SessionRepository
import com.adelbot.ui.theme.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class NewSessionUiState(
    val isLoading: Boolean = false,
    val repo: Repository? = null,
    val branches: List<Branch> = emptyList(),
    val selectedBranch: String? = null,
    val taskDescription: String = "",
    val createdSessionId: String? = null,
    val error: String? = null
)

@HiltViewModel
class NewSessionViewModel @Inject constructor(
    private val repoRepository: RepoRepository,
    private val sessionRepository: SessionRepository
) : ViewModel() {
    private val _uiState = MutableStateFlow(NewSessionUiState())
    val uiState: StateFlow<NewSessionUiState> = _uiState.asStateFlow()

    fun loadRepo(repoId: String) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            try {
                val repo = repoRepository.getRepository(repoId)
                val branches = try { repoRepository.getBranches(repoId) } catch (_: Exception) { emptyList() }
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    repo = repo,
                    branches = branches,
                    selectedBranch = repo.defaultBranch
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message)
            }
        }
    }

    fun updateTask(task: String) {
        _uiState.value = _uiState.value.copy(taskDescription = task)
    }

    fun selectBranch(branch: String) {
        _uiState.value = _uiState.value.copy(selectedBranch = branch)
    }

    fun createSession() {
        val state = _uiState.value
        if (state.repo == null || state.taskDescription.isBlank()) return

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val session = sessionRepository.createSession(
                    repositoryId = state.repo.id,
                    taskDescription = state.taskDescription,
                    branch = state.selectedBranch
                )
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    createdSessionId = session.id
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(isLoading = false, error = e.message)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NewSessionScreen(
    repoId: String,
    onSessionCreated: (String) -> Unit,
    onBack: () -> Unit,
    viewModel: NewSessionViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(repoId) { viewModel.loadRepo(repoId) }
    LaunchedEffect(uiState.createdSessionId) {
        uiState.createdSessionId?.let { onSessionCreated(it) }
    }

    var branchExpanded by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("New Session", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            if (uiState.repo != null) {
                Card(
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = AdelPrimary.copy(alpha = 0.1f)
                    )
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Filled.Folder,
                            contentDescription = null,
                            tint = AdelPrimary,
                            modifier = Modifier.size(32.dp)
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text(
                                text = uiState.repo!!.fullName,
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = uiState.repo!!.language ?: "Unknown",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                            )
                        }
                    }
                }
            }

            ExposedDropdownMenuBox(
                expanded = branchExpanded,
                onExpandedChange = { branchExpanded = it }
            ) {
                OutlinedTextField(
                    value = uiState.selectedBranch ?: "",
                    onValueChange = {},
                    readOnly = true,
                    label = { Text("Branch") },
                    leadingIcon = { Icon(Icons.Filled.CallSplit, contentDescription = null) },
                    trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = branchExpanded) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .menuAnchor(),
                    shape = RoundedCornerShape(12.dp)
                )
                ExposedDropdownMenu(
                    expanded = branchExpanded,
                    onDismissRequest = { branchExpanded = false }
                ) {
                    uiState.branches.forEach { branch ->
                        DropdownMenuItem(
                            text = { Text(branch.name) },
                            onClick = {
                                viewModel.selectBranch(branch.name)
                                branchExpanded = false
                            }
                        )
                    }
                }
            }

            OutlinedTextField(
                value = uiState.taskDescription,
                onValueChange = { viewModel.updateTask(it) },
                label = { Text("What should Claude Code do?") },
                placeholder = { Text("e.g., Add user authentication with JWT tokens, write tests, update README...") },
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(min = 150.dp),
                shape = RoundedCornerShape(12.dp),
                maxLines = 10,
                leadingIcon = { Icon(Icons.Filled.SmartToy, contentDescription = null) }
            )

            Card(
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        "Powered by Claude Code:",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    StepItem("1", "A dev container is created with your repo")
                    StepItem("2", "Claude Code analyzes, edits, and tests your code")
                    StepItem("3", "Changes are committed and pushed to GitHub")
                    StepItem("4", "Container is cleaned up, session is billed")
                }
            }

            if (uiState.error != null) {
                Card(
                    colors = CardDefaults.cardColors(containerColor = AdelError.copy(alpha = 0.1f))
                ) {
                    Text(
                        text = uiState.error!!,
                        modifier = Modifier.padding(12.dp),
                        color = AdelError,
                        style = MaterialTheme.typography.bodySmall
                    )
                }
            }

            Button(
                onClick = { viewModel.createSession() },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                shape = RoundedCornerShape(12.dp),
                enabled = uiState.taskDescription.isNotBlank() && !uiState.isLoading,
                colors = ButtonDefaults.buttonColors(containerColor = AdelPrimary)
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary,
                        strokeWidth = 2.dp
                    )
                } else {
                    Icon(Icons.Filled.RocketLaunch, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Start Session", fontWeight = FontWeight.SemiBold)
                }
            }
        }
    }
}

@Composable
private fun StepItem(number: String, text: String) {
    Row(
        modifier = Modifier.padding(vertical = 2.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = number,
            style = MaterialTheme.typography.bodySmall,
            fontWeight = FontWeight.Bold,
            color = AdelPrimary
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = text,
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.7f)
        )
    }
}
