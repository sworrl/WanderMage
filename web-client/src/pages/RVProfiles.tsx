import { useEffect, useState } from 'react'
import { rvProfiles as rvApi } from '../services/api'

export default function RVProfiles() {
  const [profiles, setProfiles] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    make: '',
    model: '',
    year: '',
    rv_class: '',
    vin: '',
    length_feet: '',
    height_feet: '',
    weight_empty: '',
    weight_gross: '',
    weight_cargo: '',
    weight_hitch: '',
    fuel_type: 'Diesel',
    fuel_grade: 'regular',
    tank_capacity_gallons: '',
    avg_mpg: '',
    has_tow_vehicle: false,
    tow_vehicle_make: '',
    tow_vehicle_model: '',
    tow_vehicle_year: '',
    tow_vehicle_weight: '',
    is_full_time: false,
    storage_location: '',
    daily_miles_target: '300',
    max_driving_hours: '8',
    notes: ''
  })
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null)

  useEffect(() => {
    loadProfiles()
  }, [])

  const loadProfiles = async () => {
    try {
      const response = await rvApi.getAll()
      setProfiles(response.data)
    } catch (error) {
      console.error('Failed to load RV profiles:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement
    const value = target.type === 'checkbox' ? target.checked : target.value
    setFormData({
      ...formData,
      [e.target.name]: value
    })
  }

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setSelectedImage(file)

      // Create preview
      const reader = new FileReader()
      reader.onloadend = () => {
        setImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const payload = {
        ...formData,
        year: formData.year ? parseInt(formData.year) : null,
        length_feet: formData.length_feet ? parseFloat(formData.length_feet) : null,
        height_feet: formData.height_feet ? parseFloat(formData.height_feet) : null,
        weight_empty: formData.weight_empty ? parseFloat(formData.weight_empty) : null,
        weight_gross: formData.weight_gross ? parseFloat(formData.weight_gross) : null,
        weight_cargo: formData.weight_cargo ? parseFloat(formData.weight_cargo) : null,
        weight_hitch: formData.weight_hitch ? parseFloat(formData.weight_hitch) : null,
        tank_capacity_gallons: formData.tank_capacity_gallons ? parseFloat(formData.tank_capacity_gallons) : null,
        avg_mpg: formData.avg_mpg ? parseFloat(formData.avg_mpg) : null,
        tow_vehicle_year: formData.tow_vehicle_year ? parseInt(formData.tow_vehicle_year) : null,
        tow_vehicle_weight: formData.tow_vehicle_weight ? parseFloat(formData.tow_vehicle_weight) : null,
        daily_miles_target: formData.daily_miles_target ? parseInt(formData.daily_miles_target) : 300,
        max_driving_hours: formData.max_driving_hours ? parseFloat(formData.max_driving_hours) : 8.0
      }

      let profileId: number

      if (editingId) {
        // Update existing profile
        await rvApi.update(editingId, payload)
        profileId = editingId
      } else {
        // Create new profile
        const response = await rvApi.create(payload)
        profileId = response.data.id
      }

      // Upload image if selected
      if (selectedImage && profileId) {
        const imageFormData = new FormData()
        imageFormData.append('file', selectedImage)

        try {
          await rvApi.uploadPhoto(profileId, imageFormData)
        } catch (imgError) {
          console.error('Failed to upload image:', imgError)
          // Don't fail the whole operation if just image upload fails
        }
      }

      setShowForm(false)
      setEditingId(null)
      setFormData({
        name: '',
        make: '',
        model: '',
        year: '',
        rv_class: '',
        vin: '',
        length_feet: '',
        height_feet: '',
        weight_empty: '',
        weight_gross: '',
        weight_cargo: '',
        weight_hitch: '',
        fuel_type: 'Diesel',
        fuel_grade: 'regular',
        tank_capacity_gallons: '',
        avg_mpg: '',
        has_tow_vehicle: false,
        tow_vehicle_make: '',
        tow_vehicle_model: '',
        tow_vehicle_year: '',
        tow_vehicle_weight: '',
        is_full_time: false,
        storage_location: '',
        daily_miles_target: '300',
        max_driving_hours: '8',
        notes: ''
      })
      setSelectedImage(null)
      setImagePreview(null)
      loadProfiles()
    } catch (error) {
      console.error('Failed to save RV profile:', error)
      alert('Failed to save RV profile')
    }
  }

  const handleEdit = (profile: any) => {
    setEditingId(profile.id)
    setFormData({
      name: profile.name || '',
      make: profile.make || '',
      model: profile.model || '',
      year: profile.year?.toString() || '',
      rv_class: profile.rv_class || '',
      vin: profile.vin || '',
      length_feet: profile.length_feet?.toString() || '',
      height_feet: profile.height_feet?.toString() || '',
      weight_empty: profile.weight_empty?.toString() || '',
      weight_gross: profile.weight_gross?.toString() || '',
      weight_cargo: profile.weight_cargo?.toString() || '',
      weight_hitch: profile.weight_hitch?.toString() || '',
      fuel_type: profile.fuel_type || 'Diesel',
      fuel_grade: profile.fuel_grade || 'regular',
      tank_capacity_gallons: profile.tank_capacity_gallons?.toString() || '',
      avg_mpg: profile.avg_mpg?.toString() || '',
      has_tow_vehicle: profile.has_tow_vehicle || false,
      tow_vehicle_make: profile.tow_vehicle_make || '',
      tow_vehicle_model: profile.tow_vehicle_model || '',
      tow_vehicle_year: profile.tow_vehicle_year?.toString() || '',
      tow_vehicle_weight: profile.tow_vehicle_weight?.toString() || '',
      is_full_time: profile.is_full_time || false,
      storage_location: profile.storage_location || '',
      daily_miles_target: profile.daily_miles_target?.toString() || '300',
      max_driving_hours: profile.max_driving_hours?.toString() || '8',
      notes: profile.notes || ''
    })
    if (profile.photo_path) {
      setImagePreview(profile.photo_path)
    }
    setShowForm(true)
  }

  const handleDelete = async (id: number) => {
    try {
      await rvApi.delete(id)
      setDeleteConfirm(null)
      loadProfiles()
    } catch (error) {
      console.error('Failed to delete RV profile:', error)
      alert('Failed to delete RV profile')
    }
  }

  const cancelDelete = () => {
    setDeleteConfirm(null)
  }

  if (loading) {
    return <div>Loading RV profiles...</div>
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <h1>RV Profiles</h1>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          Create New RV Profile
        </button>
      </div>

      {showForm && (
        <div className="card mb-4">
          <h2>{editingId ? 'Edit RV Profile' : 'New RV Profile'}</h2>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: '15px', marginTop: '20px' }}>
            <div className="form-group">
              <label className="label">Profile Name *</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="input"
                placeholder="e.g., My Winnebago"
              />
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="label">Make</label>
                <input
                  type="text"
                  name="make"
                  value={formData.make}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., Winnebago"
                />
              </div>
              <div className="form-group">
                <label className="label">Model</label>
                <input
                  type="text"
                  name="model"
                  value={formData.model}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., Minnie Winnie"
                />
              </div>
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="label">Year</label>
                <input
                  type="number"
                  name="year"
                  value={formData.year}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., 2020"
                />
              </div>
              <div className="form-group">
                <label className="label">RV Class</label>
                <select
                  name="rv_class"
                  value={formData.rv_class}
                  onChange={handleChange}
                  className="input"
                >
                  <option value="">Select RV Class</option>
                  <option value="Class A">Class A Motorhome</option>
                  <option value="Class B">Class B Motorhome (Van)</option>
                  <option value="Class C">Class C Motorhome</option>
                  <option value="Fifth Wheel">Fifth Wheel Trailer</option>
                  <option value="Travel Trailer">Travel Trailer</option>
                  <option value="Truck Camper">Truck Camper</option>
                  <option value="Toy Hauler">Toy Hauler</option>
                  <option value="Pop-up">Pop-up Camper</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="label">VIN (for auto-lookup)</label>
              <input
                type="text"
                name="vin"
                value={formData.vin}
                onChange={handleChange}
                className="input"
                placeholder="17-character VIN"
                maxLength={17}
              />
              <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                Enter VIN to auto-populate specifications
              </span>
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="label">Fuel Type</label>
                <select
                  name="fuel_type"
                  value={formData.fuel_type}
                  onChange={handleChange}
                  className="input"
                >
                  <option value="Diesel">Diesel</option>
                  <option value="Gasoline">Gasoline</option>
                  <option value="Propane">Propane</option>
                </select>
              </div>
              <div className="form-group">
                <label className="label">Fuel Grade</label>
                <select
                  name="fuel_grade"
                  value={formData.fuel_grade}
                  onChange={handleChange}
                  className="input"
                >
                  <option value="regular">Regular</option>
                  <option value="midgrade">Midgrade</option>
                  <option value="premium">Premium</option>
                  <option value="diesel">Diesel</option>
                </select>
              </div>
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="label">Length (feet)</label>
                <input
                  type="number"
                  step="0.1"
                  name="length_feet"
                  value={formData.length_feet}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., 25.5"
                />
              </div>
              <div className="form-group">
                <label className="label">Height (feet)</label>
                <input
                  type="number"
                  step="0.1"
                  name="height_feet"
                  value={formData.height_feet}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., 11.5"
                />
              </div>
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="label">Dry Weight (UVW, lbs)</label>
                <input
                  type="number"
                  name="weight_empty"
                  value={formData.weight_empty}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., 15000"
                />
                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                  Unloaded Vehicle Weight
                </span>
              </div>
              <div className="form-group">
                <label className="label">GVWR (lbs)</label>
                <input
                  type="number"
                  name="weight_gross"
                  value={formData.weight_gross}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., 22000"
                />
                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                  Gross Vehicle Weight Rating
                </span>
              </div>
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="label">Cargo Capacity (CCC, lbs)</label>
                <input
                  type="number"
                  name="weight_cargo"
                  value={formData.weight_cargo}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., 3000"
                />
              </div>
              <div className="form-group">
                <label className="label">Hitch/Pin Weight (lbs)</label>
                <input
                  type="number"
                  name="weight_hitch"
                  value={formData.weight_hitch}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., 1500"
                />
                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                  For towable RVs
                </span>
              </div>
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="label">Tank Capacity (gallons)</label>
                <input
                  type="number"
                  step="0.1"
                  name="tank_capacity_gallons"
                  value={formData.tank_capacity_gallons}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., 55"
                />
              </div>
              <div className="form-group">
                <label className="label">Average MPG</label>
                <input
                  type="number"
                  step="0.1"
                  name="avg_mpg"
                  value={formData.avg_mpg}
                  onChange={handleChange}
                  className="input"
                  placeholder="e.g., 8.5"
                />
              </div>
            </div>

            <div className="grid grid-2">
              <div className="form-group">
                <label className="label">Daily Miles Target</label>
                <input
                  type="number"
                  name="daily_miles_target"
                  value={formData.daily_miles_target}
                  onChange={handleChange}
                  className="input"
                  min={50}
                  max={800}
                  step={10}
                  placeholder="e.g., 300"
                />
                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                  Maximum miles to drive per day
                </span>
              </div>
              <div className="form-group">
                <label className="label">Max Driving Hours</label>
                <input
                  type="number"
                  step="0.5"
                  name="max_driving_hours"
                  value={formData.max_driving_hours}
                  onChange={handleChange}
                  className="input"
                  min={2}
                  max={14}
                  placeholder="e.g., 8"
                />
                <span style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                  Maximum hours to drive per day
                </span>
              </div>
            </div>

            <div className="form-group">
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  name="has_tow_vehicle"
                  checked={formData.has_tow_vehicle}
                  onChange={handleChange}
                  style={{ width: 'auto' }}
                />
                Towing a Vehicle (or Towed by Vehicle)
              </label>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                Check if you tow a car/truck behind your RV, or if your RV is towed by a truck
              </p>
            </div>

            {formData.has_tow_vehicle && (
              <>
                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="label">Tow Vehicle Make</label>
                    <input
                      type="text"
                      name="tow_vehicle_make"
                      value={formData.tow_vehicle_make}
                      onChange={handleChange}
                      className="input"
                      placeholder="e.g., Ford"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Tow Vehicle Model</label>
                    <input
                      type="text"
                      name="tow_vehicle_model"
                      value={formData.tow_vehicle_model}
                      onChange={handleChange}
                      className="input"
                      placeholder="e.g., F-150"
                    />
                  </div>
                </div>

                <div className="grid grid-2">
                  <div className="form-group">
                    <label className="label">Tow Vehicle Year</label>
                    <input
                      type="number"
                      name="tow_vehicle_year"
                      value={formData.tow_vehicle_year}
                      onChange={handleChange}
                      className="input"
                      placeholder="e.g., 2020"
                    />
                  </div>
                  <div className="form-group">
                    <label className="label">Tow Vehicle Weight (lbs)</label>
                    <input
                      type="number"
                      name="tow_vehicle_weight"
                      value={formData.tow_vehicle_weight}
                      onChange={handleChange}
                      className="input"
                      placeholder="e.g., 5000"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="label" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  name="is_full_time"
                  checked={formData.is_full_time}
                  onChange={handleChange}
                  style={{ width: 'auto' }}
                />
                Full Time RV (living in RV)
              </label>
              <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                {formData.is_full_time
                  ? 'Current location will update automatically with your trips'
                  : 'Check this if you live in your RV full time'}
              </p>
            </div>

            <div className="form-group">
              <label className="label">
                {formData.is_full_time ? 'Current Location' : 'Storage Location'}
              </label>
              <input
                type="text"
                name="storage_location"
                value={formData.storage_location}
                onChange={handleChange}
                className="input"
                placeholder={formData.is_full_time
                  ? "e.g., Yosemite National Park, CA"
                  : "e.g., Home driveway, Storage facility on Main St"}
              />
            </div>

            <div className="form-group">
              <label className="label">RV Photo</label>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                className="input"
                style={{ padding: '8px' }}
              />
              {imagePreview && (
                <div style={{ marginTop: '10px' }}>
                  <img
                    src={imagePreview}
                    alt="Preview"
                    style={{
                      maxWidth: '300px',
                      maxHeight: '200px',
                      borderRadius: '8px',
                      objectFit: 'cover'
                    }}
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label className="label">Notes</label>
              <textarea
                name="notes"
                value={formData.notes}
                onChange={handleChange}
                className="input"
                rows={3}
                placeholder="Any additional notes about your RV"
              />
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update Profile' : 'Create Profile'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false)
                  setEditingId(null)
                  setFormData({
                    name: '',
                    make: '',
                    model: '',
                    year: '',
                    rv_class: '',
                    vin: '',
                    length_feet: '',
                    height_feet: '',
                    weight_empty: '',
                    weight_gross: '',
                    weight_cargo: '',
                    weight_hitch: '',
                    fuel_type: 'Diesel',
                    fuel_grade: 'regular',
                    tank_capacity_gallons: '',
                    avg_mpg: '',
                    has_tow_vehicle: false,
                    tow_vehicle_make: '',
                    tow_vehicle_model: '',
                    tow_vehicle_year: '',
                    tow_vehicle_weight: '',
                    is_full_time: false,
                    storage_location: '',
                    daily_miles_target: '300',
                    max_driving_hours: '8',
                    notes: ''
                  })
                  setSelectedImage(null)
                  setImagePreview(null)
                }}
                className="btn btn-secondary"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {profiles.length === 0 ? (
        <div className="card">
          <p>No RV profiles yet. Create one to get started!</p>
        </div>
      ) : (
        <div className="grid grid-2">
          {profiles.filter(profile => profile.id !== editingId).map(profile => (
            <div key={profile.id} className="card">
              {profile.photo_path && (
                <img
                  src={profile.photo_path}
                  alt={profile.name}
                  style={{
                    width: '100%',
                    height: '200px',
                    objectFit: 'cover',
                    borderRadius: '8px',
                    marginBottom: '15px'
                  }}
                />
              )}
              <h2>{profile.name}</h2>
              <div style={{ display: 'grid', gap: '8px', fontSize: '14px', marginTop: '15px' }}>
                {profile.make && profile.model && (
                  <div>
                    <strong>Make/Model:</strong> {profile.make} {profile.model} {profile.year}
                  </div>
                )}
                {profile.length_feet && (
                  <div>
                    <strong>Length:</strong> {profile.length_feet} ft
                  </div>
                )}
                {profile.height_feet && (
                  <div>
                    <strong>Height:</strong> {profile.height_feet} ft
                  </div>
                )}
                {profile.rv_class && (
                  <div>
                    <strong>RV Class:</strong> {profile.rv_class}
                  </div>
                )}
                {profile.vin && (
                  <div>
                    <strong>VIN:</strong> {profile.vin}
                  </div>
                )}
                {profile.weight_empty && (
                  <div>
                    <strong>Dry Weight (UVW):</strong> {profile.weight_empty.toLocaleString()} lbs
                  </div>
                )}
                {profile.weight_gross && (
                  <div>
                    <strong>GVWR:</strong> {profile.weight_gross.toLocaleString()} lbs
                  </div>
                )}
                {profile.weight_cargo && (
                  <div>
                    <strong>Cargo Capacity (CCC):</strong> {profile.weight_cargo.toLocaleString()} lbs
                  </div>
                )}
                {profile.weight_hitch && (
                  <div>
                    <strong>Hitch Weight:</strong> {profile.weight_hitch.toLocaleString()} lbs
                  </div>
                )}
                {profile.has_tow_vehicle && (
                  <div>
                    <strong>Tow Vehicle:</strong> {profile.tow_vehicle_year} {profile.tow_vehicle_make} {profile.tow_vehicle_model}
                    {profile.tow_vehicle_weight && ` (${profile.tow_vehicle_weight.toLocaleString()} lbs)`}
                  </div>
                )}
                {profile.weight_gross && profile.has_tow_vehicle && profile.tow_vehicle_weight && (
                  <div>
                    <strong>Combined Weight:</strong> {(profile.weight_gross + profile.tow_vehicle_weight).toLocaleString()} lbs
                  </div>
                )}
                {profile.fuel_type && (
                  <div>
                    <strong>Fuel Type:</strong> {profile.fuel_type}
                  </div>
                )}
                {profile.tank_capacity_gallons && (
                  <div>
                    <strong>Tank Capacity:</strong> {profile.tank_capacity_gallons} gal
                  </div>
                )}
                {profile.avg_mpg && (
                  <div>
                    <strong>Average MPG:</strong> {profile.avg_mpg}
                  </div>
                )}
                {profile.daily_miles_target && (
                  <div>
                    <strong>Daily Miles Target:</strong> {profile.daily_miles_target} mi/day
                  </div>
                )}
                {profile.max_driving_hours && (
                  <div>
                    <strong>Max Driving Hours:</strong> {profile.max_driving_hours} hrs/day
                  </div>
                )}
                {profile.is_full_time && (
                  <div>
                    <strong>Full Time RV</strong>
                  </div>
                )}
                {profile.storage_location && (
                  <div>
                    <strong>{profile.is_full_time ? 'Current Location:' : 'Storage Location:'}</strong> {profile.storage_location}
                  </div>
                )}
              </div>
              {profile.notes && (
                <p style={{ marginTop: '15px', color: '#6b7280', fontSize: '14px' }}>
                  {profile.notes}
                </p>
              )}

              {deleteConfirm === profile.id ? (
                <div style={{ marginTop: '15px' }}>
                  <p style={{ color: '#DC2626', fontWeight: 'bold', marginBottom: '10px', fontSize: '14px' }}>
                    Are you sure you want to delete this RV profile? This action cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(profile.id)}
                      className="btn btn-danger"
                      style={{ flex: 1 }}
                    >
                      Yes, Delete
                    </button>
                    <button
                      onClick={cancelDelete}
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2" style={{ marginTop: '15px' }}>
                  <button
                    onClick={() => handleEdit(profile)}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(profile.id)}
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
