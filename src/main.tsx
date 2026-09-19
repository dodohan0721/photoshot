import { createRoot } from 'react-dom/client';
import Editor from './editor';
import './styles.css';
import './theme.css';
createRoot(document.getElementById('root')!).render(<Editor />);
