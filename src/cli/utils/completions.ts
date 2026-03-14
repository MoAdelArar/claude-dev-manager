const COMMANDS = [
  'agents',
  'analyze',
  'artifacts',
  'completion',
  'config',
  'dashboard',
  'history',
  'init',
  'pipeline',
  'resume',
  'show',
  'skills',
  'start',
  'status',
];

const TEMPLATES = [
  'quick-fix',
  'feature',
  'full-feature',
  'review-only',
  'design-only',
  'deploy',
];

const PRIORITIES = ['low', 'medium', 'high', 'critical'];

const SKILL_CATEGORIES = ['planning', 'design', 'build', 'review', 'operations'];

export function generateBashCompletion(): string {
  return `# CDM Bash Completion
# Add to ~/.bashrc or ~/.bash_profile:
# source <(cdm completion bash)
# Or save to a file:
# cdm completion bash > /etc/bash_completion.d/cdm

_cdm_completions() {
    local cur prev opts commands templates priorities categories
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"
    
    commands="${COMMANDS.join(' ')}"
    templates="${TEMPLATES.join(' ')}"
    priorities="${PRIORITIES.join(' ')}"
    categories="${SKILL_CATEGORIES.join(' ')}"

    # Complete commands
    if [[ \${COMP_CWORD} -eq 1 ]]; then
        COMPREPLY=( \$(compgen -W "\${commands}" -- "\${cur}") )
        return 0
    fi

    # Complete based on previous word
    case "\${prev}" in
        --template|-t)
            COMPREPLY=( \$(compgen -W "\${templates}" -- "\${cur}") )
            return 0
            ;;
        --priority|-P)
            COMPREPLY=( \$(compgen -W "\${priorities}" -- "\${cur}") )
            return 0
            ;;
        --category|-c)
            COMPREPLY=( \$(compgen -W "\${categories}" -- "\${cur}") )
            return 0
            ;;
        --mode)
            COMPREPLY=( \$(compgen -W "claude-cli simulation" -- "\${cur}") )
            return 0
            ;;
        --project|-p)
            COMPREPLY=( \$(compgen -d -- "\${cur}") )
            return 0
            ;;
        completion)
            COMPREPLY=( \$(compgen -W "bash zsh fish" -- "\${cur}") )
            return 0
            ;;
    esac

    # Complete flags based on command
    local cmd="\${COMP_WORDS[1]}"
    case "\${cmd}" in
        start)
            opts="--template -t --priority -P --skip-steps --max-retries --dry-run --interactive --project -p --mode --model --verbose -v --json --estimate"
            ;;
        resume)
            opts="--skip-steps --max-retries --project -p --mode --model --verbose -v --json"
            ;;
        skills)
            opts="--category -c --json"
            ;;
        pipeline)
            opts="--template -t --json"
            ;;
        config)
            opts="--project -p --set --reset --json"
            ;;
        analyze)
            opts="--project -p --output -o --json"
            ;;
        history)
            opts="--project -p --feature -f --last -n --export --json"
            ;;
        artifacts)
            opts="--project -p --type -t --json"
            ;;
        *)
            opts="--help -h --json --verbose -v"
            ;;
    esac

    if [[ "\${cur}" == -* ]]; then
        COMPREPLY=( \$(compgen -W "\${opts}" -- "\${cur}") )
        return 0
    fi
}

complete -F _cdm_completions cdm
`;
}

export function generateZshCompletion(): string {
  return `#compdef cdm

# CDM Zsh Completion
# Add to ~/.zshrc:
# source <(cdm completion zsh)
# Or save to a file in your fpath:
# cdm completion zsh > ~/.zsh/completions/_cdm

_cdm() {
    local -a commands templates priorities categories
    
    commands=(
        'agents:List all available agents and their skills'
        'analyze:Analyze the target project'
        'artifacts:List all artifacts produced during development'
        'completion:Generate shell completion scripts'
        'config:View or update CDM configuration'
        'dashboard:Show project dashboard'
        'history:Show the development history timeline'
        'init:Initialize CDM in the current project'
        'pipeline:Show available pipeline templates'
        'resume:Resume a failed or paused feature pipeline'
        'show:Show details of a specific artifact or feature'
        'skills:List all available skills'
        'start:Start the development pipeline for a new feature'
        'status:Show the status of the current feature pipeline'
    )
    
    templates=(${TEMPLATES.map((t) => `'${t}'`).join(' ')})
    priorities=(${PRIORITIES.map((p) => `'${p}'`).join(' ')})
    categories=(${SKILL_CATEGORIES.map((c) => `'${c}'`).join(' ')})

    _arguments -C \\
        '1: :->command' \\
        '*: :->args'

    case \$state in
        command)
            _describe -t commands 'cdm commands' commands
            ;;
        args)
            case \$words[2] in
                start)
                    _arguments \\
                        '(-t --template)'{-t,--template}'[Pipeline template]:template:(\$templates)' \\
                        '(-P --priority)'{-P,--priority}'[Feature priority]:priority:(\$priorities)' \\
                        '--skip-steps[Comma-separated step indices to skip]' \\
                        '--max-retries[Maximum retries per step]' \\
                        '--dry-run[Show what would happen without executing]' \\
                        '--interactive[Run with interactive prompts]' \\
                        '(-p --project)'{-p,--project}'[Project path]:project:_directories' \\
                        '--mode[Execution mode]:mode:(claude-cli simulation)' \\
                        '--model[Claude model to use]' \\
                        '(-v --verbose)'{-v,--verbose}'[Verbose output]' \\
                        '--json[Output result as JSON]' \\
                        '--estimate[Show cost/time estimate without running]' \\
                        ':description:'
                    ;;
                resume)
                    _arguments \\
                        '--skip-steps[Comma-separated step indices to skip]' \\
                        '--max-retries[Maximum retries per step]' \\
                        '(-p --project)'{-p,--project}'[Project path]:project:_directories' \\
                        '--mode[Execution mode]:mode:(claude-cli simulation)' \\
                        '--model[Claude model to use]' \\
                        '(-v --verbose)'{-v,--verbose}'[Verbose output]' \\
                        '--json[Output result as JSON]' \\
                        ':feature-id:'
                    ;;
                skills)
                    _arguments \\
                        '(-c --category)'{-c,--category}'[Filter by category]:category:(\$categories)' \\
                        '--json[Output as JSON]'
                    ;;
                pipeline)
                    _arguments \\
                        '(-t --template)'{-t,--template}'[Show details for template]:template:(\$templates)' \\
                        '--json[Output as JSON]'
                    ;;
                completion)
                    _arguments '1:shell:(bash zsh fish)'
                    ;;
                *)
                    _arguments \\
                        '(-h --help)'{-h,--help}'[Show help]' \\
                        '--json[Output as JSON]' \\
                        '(-v --verbose)'{-v,--verbose}'[Verbose output]'
                    ;;
            esac
            ;;
    esac
}

_cdm
`;
}

export function generateFishCompletion(): string {
  return `# CDM Fish Completion
# Add to ~/.config/fish/completions/cdm.fish:
# cdm completion fish > ~/.config/fish/completions/cdm.fish

# Disable file completion by default
complete -c cdm -f

# Commands
${COMMANDS.map(
    (cmd) => `complete -c cdm -n "__fish_use_subcommand" -a "${cmd}" -d "${getCommandDescription(cmd)}"`
  ).join('\n')}

# Global flags
complete -c cdm -l help -s h -d "Show help"
complete -c cdm -l json -d "Output as JSON"
complete -c cdm -l verbose -s v -d "Verbose output"

# start command options
complete -c cdm -n "__fish_seen_subcommand_from start" -l template -s t -d "Pipeline template" -xa "${TEMPLATES.join(' ')}"
complete -c cdm -n "__fish_seen_subcommand_from start" -l priority -s P -d "Feature priority" -xa "${PRIORITIES.join(' ')}"
complete -c cdm -n "__fish_seen_subcommand_from start" -l skip-steps -d "Steps to skip"
complete -c cdm -n "__fish_seen_subcommand_from start" -l max-retries -d "Max retries"
complete -c cdm -n "__fish_seen_subcommand_from start" -l dry-run -d "Show plan without executing"
complete -c cdm -n "__fish_seen_subcommand_from start" -l interactive -d "Interactive prompts"
complete -c cdm -n "__fish_seen_subcommand_from start" -l project -s p -d "Project path" -xa "(__fish_complete_directories)"
complete -c cdm -n "__fish_seen_subcommand_from start" -l mode -d "Execution mode" -xa "claude-cli simulation"
complete -c cdm -n "__fish_seen_subcommand_from start" -l model -d "Claude model"
complete -c cdm -n "__fish_seen_subcommand_from start" -l estimate -d "Show cost estimate"

# resume command options
complete -c cdm -n "__fish_seen_subcommand_from resume" -l skip-steps -d "Steps to skip"
complete -c cdm -n "__fish_seen_subcommand_from resume" -l max-retries -d "Max retries"
complete -c cdm -n "__fish_seen_subcommand_from resume" -l project -s p -d "Project path" -xa "(__fish_complete_directories)"
complete -c cdm -n "__fish_seen_subcommand_from resume" -l mode -d "Execution mode" -xa "claude-cli simulation"
complete -c cdm -n "__fish_seen_subcommand_from resume" -l model -d "Claude model"

# skills command options
complete -c cdm -n "__fish_seen_subcommand_from skills" -l category -s c -d "Filter by category" -xa "${SKILL_CATEGORIES.join(' ')}"

# pipeline command options
complete -c cdm -n "__fish_seen_subcommand_from pipeline" -l template -s t -d "Show template details" -xa "${TEMPLATES.join(' ')}"

# completion command
complete -c cdm -n "__fish_seen_subcommand_from completion" -a "bash zsh fish" -d "Shell type"

# config command options
complete -c cdm -n "__fish_seen_subcommand_from config" -l project -s p -d "Project path" -xa "(__fish_complete_directories)"
complete -c cdm -n "__fish_seen_subcommand_from config" -l set -d "Set config value"
complete -c cdm -n "__fish_seen_subcommand_from config" -l reset -d "Reset to defaults"

# analyze command options
complete -c cdm -n "__fish_seen_subcommand_from analyze" -l project -s p -d "Project path" -xa "(__fish_complete_directories)"
complete -c cdm -n "__fish_seen_subcommand_from analyze" -l output -s o -d "Output directory"

# history command options
complete -c cdm -n "__fish_seen_subcommand_from history" -l project -s p -d "Project path" -xa "(__fish_complete_directories)"
complete -c cdm -n "__fish_seen_subcommand_from history" -l feature -s f -d "Filter by feature"
complete -c cdm -n "__fish_seen_subcommand_from history" -l last -s n -d "Show last N events"
complete -c cdm -n "__fish_seen_subcommand_from history" -l export -d "Export history"

# artifacts command options
complete -c cdm -n "__fish_seen_subcommand_from artifacts" -l project -s p -d "Project path" -xa "(__fish_complete_directories)"
complete -c cdm -n "__fish_seen_subcommand_from artifacts" -l type -s t -d "Filter by type"
`;
}

function getCommandDescription(cmd: string): string {
  const descriptions: Record<string, string> = {
    agents: 'List all available agents',
    analyze: 'Analyze the target project',
    artifacts: 'List all artifacts',
    completion: 'Generate shell completions',
    config: 'View or update configuration',
    dashboard: 'Show project dashboard',
    history: 'Show development history',
    init: 'Initialize CDM in project',
    pipeline: 'Show pipeline templates',
    resume: 'Resume a pipeline',
    show: 'Show artifact or feature details',
    skills: 'List all available skills',
    start: 'Start a new pipeline',
    status: 'Show pipeline status',
  };
  return descriptions[cmd] || cmd;
}
