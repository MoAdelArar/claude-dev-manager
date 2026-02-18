package com.adelbot.ui.navigation

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavType
import androidx.navigation.compose.*
import androidx.navigation.navArgument
import com.adelbot.ui.screens.*

sealed class Screen(val route: String) {
    data object Login : Screen("login")
    data object Home : Screen("home")
    data object Repositories : Screen("repositories")
    data object Sessions : Screen("sessions")
    data object Billing : Screen("billing")
    data object NewSession : Screen("new_session/{repoId}") {
        fun createRoute(repoId: String) = "new_session/$repoId"
    }
    data object SessionDetail : Screen("session/{sessionId}") {
        fun createRoute(sessionId: String) = "session/$sessionId"
    }
    data object SessionLive : Screen("session_live/{sessionId}") {
        fun createRoute(sessionId: String) = "session_live/$sessionId"
    }
}

data class BottomNavItem(
    val screen: Screen,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector
)

val bottomNavItems = listOf(
    BottomNavItem(Screen.Home, "Home", Icons.Filled.Home, Icons.Outlined.Home),
    BottomNavItem(Screen.Repositories, "Repos", Icons.Filled.Folder, Icons.Outlined.Folder),
    BottomNavItem(Screen.Sessions, "Sessions", Icons.Filled.Terminal, Icons.Outlined.Terminal),
    BottomNavItem(Screen.Billing, "Billing", Icons.Filled.Receipt, Icons.Outlined.Receipt),
)

@Composable
fun AdelBotNavHost() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    val showBottomBar = currentDestination?.route in bottomNavItems.map { it.screen.route }

    Scaffold(
        bottomBar = {
            if (showBottomBar) {
                NavigationBar {
                    bottomNavItems.forEach { item ->
                        val selected = currentDestination?.hierarchy?.any {
                            it.route == item.screen.route
                        } == true
                        NavigationBarItem(
                            icon = {
                                Icon(
                                    if (selected) item.selectedIcon else item.unselectedIcon,
                                    contentDescription = item.label
                                )
                            },
                            label = { Text(item.label) },
                            selected = selected,
                            onClick = {
                                navController.navigate(item.screen.route) {
                                    popUpTo(navController.graph.findStartDestination().id) {
                                        saveState = true
                                    }
                                    launchSingleTop = true
                                    restoreState = true
                                }
                            }
                        )
                    }
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Login.route,
            modifier = Modifier.padding(innerPadding),
            enterTransition = { fadeIn(animationSpec = tween(300)) },
            exitTransition = { fadeOut(animationSpec = tween(300)) },
        ) {
            composable(Screen.Login.route) {
                LoginScreen(
                    onLoginSuccess = {
                        navController.navigate(Screen.Home.route) {
                            popUpTo(Screen.Login.route) { inclusive = true }
                        }
                    }
                )
            }

            composable(Screen.Home.route) {
                HomeScreen(
                    onNavigateToRepos = { navController.navigate(Screen.Repositories.route) },
                    onNavigateToSessions = { navController.navigate(Screen.Sessions.route) },
                    onNavigateToSession = { sessionId ->
                        navController.navigate(Screen.SessionDetail.createRoute(sessionId))
                    },
                    onLogout = {
                        navController.navigate(Screen.Login.route) {
                            popUpTo(0) { inclusive = true }
                        }
                    }
                )
            }

            composable(Screen.Repositories.route) {
                RepositoriesScreen(
                    onRepoSelected = { repoId ->
                        navController.navigate(Screen.NewSession.createRoute(repoId))
                    }
                )
            }

            composable(
                Screen.NewSession.route,
                arguments = listOf(navArgument("repoId") { type = NavType.StringType })
            ) { backStackEntry ->
                val repoId = backStackEntry.arguments?.getString("repoId") ?: return@composable
                NewSessionScreen(
                    repoId = repoId,
                    onSessionCreated = { sessionId ->
                        navController.navigate(Screen.SessionLive.createRoute(sessionId)) {
                            popUpTo(Screen.Repositories.route)
                        }
                    },
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Screen.Sessions.route) {
                SessionsScreen(
                    onSessionSelected = { sessionId ->
                        navController.navigate(Screen.SessionDetail.createRoute(sessionId))
                    }
                )
            }

            composable(
                Screen.SessionDetail.route,
                arguments = listOf(navArgument("sessionId") { type = NavType.StringType })
            ) { backStackEntry ->
                val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable
                SessionDetailScreen(
                    sessionId = sessionId,
                    onBack = { navController.popBackStack() },
                    onOpenLive = {
                        navController.navigate(Screen.SessionLive.createRoute(sessionId))
                    }
                )
            }

            composable(
                Screen.SessionLive.route,
                arguments = listOf(navArgument("sessionId") { type = NavType.StringType })
            ) { backStackEntry ->
                val sessionId = backStackEntry.arguments?.getString("sessionId") ?: return@composable
                SessionLiveScreen(
                    sessionId = sessionId,
                    onBack = { navController.popBackStack() }
                )
            }

            composable(Screen.Billing.route) {
                BillingScreen()
            }
        }
    }
}
