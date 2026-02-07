import { useState } from 'react';
import { toast } from './Toast';
import './TeamsPanel.css';

interface TeamsPanelProps {
  isAuthed: boolean;
}

interface Team {
  id: string;
  name: string;
  description: string;
  memberCount: number;
  role: 'owner' | 'admin' | 'member';
  avatar: string;
}

export function TeamsPanel({ isAuthed }: TeamsPanelProps): JSX.Element {
  const [teams, setTeams] = useState<Team[]>([
    {
      id: '1',
      name: 'My Team',
      description: 'Your default team workspace',
      memberCount: 1,
      role: 'owner',
      avatar: '👥',
    },
  ]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');

  const handleCreateTeam = (): void => {
    if (!newTeamName.trim()) {
      toast('Please enter a team name', 'error');
      return;
    }

    const newTeam: Team = {
      id: String(Date.now()),
      name: newTeamName.trim(),
      description: '',
      memberCount: 1,
      role: 'owner',
      avatar: '👥',
    };

    setTeams(prev => [...prev, newTeam]);
    setNewTeamName('');
    setShowCreateForm(false);
    toast('Team created successfully');
  };

  if (!isAuthed) {
    return (
      <div className="teams-panel">
        <div className="login-prompt">
          <p>Sign in to manage your teams</p>
        </div>
      </div>
    );
  }

  return (
    <div className="teams-panel">
      <div className="teams-header">
        <h3>Your Teams</h3>
        <button
          className="create-team-btn"
          onClick={() => setShowCreateForm(!showCreateForm)}
        >
          + New Team
        </button>
      </div>

      {showCreateForm && (
        <div className="create-team-form">
          <input
            type="text"
            placeholder="Team name"
            value={newTeamName}
            onChange={(e) => setNewTeamName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTeam()}
            autoFocus
          />
          <div className="form-actions">
            <button className="btn-create" onClick={handleCreateTeam}>
              Create
            </button>
            <button className="btn-cancel" onClick={() => setShowCreateForm(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="teams-list">
        {teams.map(team => (
          <div key={team.id} className="team-card">
            <div className="team-avatar">{team.avatar}</div>
            <div className="team-info">
              <div className="team-name">{team.name}</div>
              <div className="team-meta">
                <span className="member-count">{team.memberCount} member{team.memberCount !== 1 ? 's' : ''}</span>
                <span className="role-badge">{team.role}</span>
              </div>
            </div>
            <button className="team-action-btn" title="Team settings">
              ⚙️
            </button>
          </div>
        ))}
      </div>

      <div className="teams-footer">
        <p>Teams allow you to collaborate with others and share topics within your organization.</p>
      </div>
    </div>
  );
}
