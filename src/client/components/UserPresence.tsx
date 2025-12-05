import { useState, useEffect } from 'react';
import './UserPresence.css';

interface User {
  id: string;
  name: string;
  avatarUrl?: string;
  isOnline: boolean;
}

interface UserPresenceProps {
  position?: 'top' | 'top-right';
}

export function UserPresence({ position = 'top-right' }: UserPresenceProps) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    // In production, this would connect to real-time presence
    // For now, show mock users
    setUsers([
      { 
        id: '1', 
        name: 'Current User', 
        avatarUrl: 'https://ui-avatars.com/api/?name=CU&size=32&background=4285f4',
        isOnline: true 
      },
      { 
        id: '2', 
        name: 'John Doe', 
        avatarUrl: 'https://ui-avatars.com/api/?name=JD&size=32&background=34a853',
        isOnline: true 
      },
      { 
        id: '3', 
        name: 'Jane Smith', 
        avatarUrl: 'https://ui-avatars.com/api/?name=JS&size=32&background=ea4335',
        isOnline: false 
      }
    ]);
  }, []);

  return (
    <div className={`user-presence ${position}`}>
      {users.map(user => (
        <div 
          key={user.id} 
          className={`user-avatar ${user.isOnline ? 'online' : 'offline'}`}
          title={`${user.name} ${user.isOnline ? '(online)' : '(offline)'}`}
        >
          <img src={user.avatarUrl} alt={user.name} />
          {user.isOnline && <span className="online-indicator" />}
        </div>
      ))}
    </div>
  );
}