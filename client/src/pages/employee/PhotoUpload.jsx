import { useRef, useState } from 'react';
import { api } from '../../api/client.js';
import Button from '../../components/Button.jsx';

const ALLOWED_TYPES = ['image/jpeg', 'image/png'];
const MAX_BYTES = 2 * 1024 * 1024;

export default function PhotoUpload({ employeeId, photoUrl, onUploaded }) {
  const fileInputRef = useRef(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  async function handleChange(e) {
    const file = e.target.files?.[0];
    e.target.value = ''; // lets the same file be re-selected later
    if (!file) return;
    setError('');
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError('Upload a JPEG or PNG image.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setError('That photo is larger than 2MB.');
      return;
    }
    const formData = new FormData();
    formData.append('photo', file);
    setUploading(true);
    try {
      const res = await api.post(`/employees/${employeeId}/photo`, formData, { isMultipart: true });
      onUploaded(res.profilePhotoPath);
    } catch (err) {
      setError(err.message || 'Could not upload that photo. Try again.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-alt text-lg font-semibold text-text-muted">?</div>
      )}
      <div className="flex flex-col gap-1">
        <Button variant="ghost" type="button" loading={uploading} onClick={() => fileInputRef.current?.click()}>
          Change photo
        </Button>
        <p className="text-xs text-text-muted">JPEG or PNG, up to 2MB.</p>
        {error && <p role="alert" className="text-xs text-danger">{error}</p>}
        <input
          ref={fileInputRef} type="file" accept="image/jpeg,image/png"
          className="hidden" onChange={handleChange}
        />
      </div>
    </div>
  );
}
