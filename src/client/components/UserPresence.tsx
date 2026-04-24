import { useState, useEffect } from 'react';
import './UserPresence.css';

interface User {
  id: string;
  name: string;
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
        isOnline: true 
      },
      { 
        id: '2', 
        name: 'John Doe', 
        isOnline: true 
      },
      { 
        id: '3', 
        name: 'Jane Smith', 
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
          <span className="user-avatar-initials" aria-label={user.name}>
            {user.name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
          </span>
          {user.isOnline && <span className="online-indicator" />}
        </div>
      ))}
    </div>
  );
}
