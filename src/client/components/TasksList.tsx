import { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import './TasksList.css';

interface TasksListProps {
  isAuthed: boolean;
  onSelectTask: (topicId: string) => void;
}

interface Task {
  id: string;
  topicId: string;
  topicTitle: string;
  taskText: string;
  assignee?: string;
  authorName: string;
  dueDate?: string;
  isCompleted: boolean;
  createdAt: string;
}

interface TasksResponse {
  tasks: Task[];
  total: number;
  pendingCount: number;
  completedCount: number;
}

export function TasksList({ isAuthed, onSelectTask }: TasksListProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('all');
  const [pendingCount, setPendingCount] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);

  const loadTasks = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api<TasksResponse>(`/api/tasks?filter=${filter}`);
      if (response.ok && response.data && typeof response.data === 'object') {
        const data = response.data as TasksResponse;
        setTasks(data.tasks);
        setPendingCount(data.pendingCount);
        setCompletedCount(data.completedCount);
      }
    } catch (error) {
      console.error('Failed to load tasks:', error);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    if (!isAuthed) {
      setLoading(false);
      return;
    }

    loadTasks();
  }, [isAuthed, loadTasks]);

  const toggleTask = async (taskId: string, _currentStatus: boolean) => {
    try {
      const response = await api<{ isCompleted: boolean }>(`/api/tasks/${taskId}/toggle`, { method: 'POST' });
      if (response.ok && response.data && typeof response.data === 'object') {
        const data = response.data as { isCompleted: boolean };
        setTasks(prev => prev.map(t =>
          t.id === taskId ? { ...t, isCompleted: data.isCompleted } : t
        ));
        // Update counts
        if (data.isCompleted) {
          setPendingCount(prev => Math.max(0, prev - 1));
          setCompletedCount(prev => prev + 1);
        } else {
          setPendingCount(prev => prev + 1);
          setCompletedCount(prev => Math.max(0, prev - 1));
        }
      }
    } catch (error) {
      console.error('Failed to toggle task:', error);
    }
  };

  const filteredTasks = tasks.filter(task => {
    if (filter === 'pending') return !task.isCompleted;
    if (filter === 'completed') return task.isCompleted;
    return true;
  });

  const formatDueDate = (dueDate?: string) => {
    if (!dueDate) return null;
    const date = new Date(dueDate);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    
    if (diff < 0) {
      return <span className="overdue">Overdue</span>;
    } else if (diff < 86400000) {
      return <span className="due-soon">Due today</span>;
    } else if (diff < 172800000) {
      return <span className="due-soon">Due tomorrow</span>;
    } else {
      return <span>Due {date.toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>;
    }
  };

  if (!isAuthed) {
    return (
      <div className="tasks-list">
        <div className="login-prompt">
          <p>Sign in to view your tasks</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="tasks-list">
        <div className="loading">Loading tasks...</div>
      </div>
    );
  }

  return (
    <div className="tasks-list">
      <div className="tasks-filter">
        <button 
          className={filter === 'all' ? 'active' : ''}
          onClick={() => setFilter('all')}
        >
          All ({tasks.length})
        </button>
        <button 
          className={filter === 'pending' ? 'active' : ''}
          onClick={() => setFilter('pending')}
        >
          Pending ({pendingCount})
        </button>
        <button 
          className={filter === 'completed' ? 'active' : ''}
          onClick={() => setFilter('completed')}
        >
          Completed ({completedCount})
        </button>
      </div>
      
      <div className="tasks-items">
        {filteredTasks.length === 0 ? (
          <div className="no-tasks">
            {filter === 'pending' ? 'No pending tasks' : 
             filter === 'completed' ? 'No completed tasks' : 
             'No tasks yet'}
          </div>
        ) : (
          filteredTasks.map(task => (
            <div 
              key={task.id}
              className={`task-item ${task.isCompleted ? 'completed' : ''}`}
              onClick={() => onSelectTask(task.topicId)}
            >
              <div className="task-checkbox">
                <input
                  type="checkbox"
                  checked={task.isCompleted}
                  onClick={e => e.stopPropagation()}
                  onChange={() => toggleTask(task.id, task.isCompleted)}
                />
              </div>
              <div className="task-content">
                <div className="task-header">
                  <span className="topic-title">{task.topicTitle}</span>
                  {task.dueDate && formatDueDate(task.dueDate)}
                </div>
                <div className="task-text">{task.taskText}</div>
                <div className="task-meta">
                  {task.assignee && <span className="assignee">Assigned to {task.assignee}</span>}
                  <span className="author">by {task.authorName}</span>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
