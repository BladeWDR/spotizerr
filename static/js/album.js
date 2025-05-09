import { downloadQueue } from './queue.js';

document.addEventListener('DOMContentLoaded', () => {
  const pathSegments = window.location.pathname.split('/');
  const albumId = pathSegments[pathSegments.indexOf('album') + 1];

  if (!albumId) {
    showError('No album ID provided.');
    return;
  }

  // Fetch album info directly
  fetch(`/api/album/info?id=${encodeURIComponent(albumId)}`)
    .then(response => {
      if (!response.ok) throw new Error('Network response was not ok');
      return response.json();
    })
    .then(data => renderAlbum(data))
    .catch(error => {
      console.error('Error:', error);
      showError('Failed to load album.');
    });

  const queueIcon = document.getElementById('queueIcon');
  if (queueIcon) {
    queueIcon.addEventListener('click', () => {
      downloadQueue.toggleVisibility();
    });
  }
});

function renderAlbum(album) {
  // Hide loading and error messages.
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('error').classList.add('hidden');

  // Check if album itself is marked explicit and filter is enabled
  const isExplicitFilterEnabled = downloadQueue.isExplicitFilterEnabled();
  if (isExplicitFilterEnabled && album.explicit) {
    // Show placeholder for explicit album
    const placeholderContent = `
      <div class="explicit-filter-placeholder">
        <h2>Explicit Content Filtered</h2>
        <p>This album contains explicit content and has been filtered based on your settings.</p>
        <p>The explicit content filter is controlled by environment variables.</p>
      </div>
    `;
    
    const contentContainer = document.getElementById('album-header');
    if (contentContainer) {
      contentContainer.innerHTML = placeholderContent;
      contentContainer.classList.remove('hidden');
    }
    
    return; // Stop rendering the actual album content
  }

  const baseUrl = window.location.origin;

  // Set album header info.
  document.getElementById('album-name').innerHTML = 
    `<a href="${baseUrl}/album/${album.id || ''}">${album.name || 'Unknown Album'}</a>`;

  document.getElementById('album-artist').innerHTML = 
    `By ${album.artists?.map(artist => 
      `<a href="${baseUrl}/artist/${artist?.id || ''}">${artist?.name || 'Unknown Artist'}</a>`
    ).join(', ') || 'Unknown Artist'}`;

  const releaseYear = album.release_date ? new Date(album.release_date).getFullYear() : 'N/A';
  document.getElementById('album-stats').textContent =
    `${releaseYear} • ${album.total_tracks || '0'} songs • ${album.label || 'Unknown Label'}`;

  document.getElementById('album-copyright').textContent =
    album.copyrights?.map(c => c?.text || '').filter(text => text).join(' • ') || '';

  const image = album.images?.[0]?.url || '/static/images/placeholder.jpg';
  document.getElementById('album-image').src = image;

  // Create (if needed) the Home Button.
  let homeButton = document.getElementById('homeButton');
  if (!homeButton) {
    homeButton = document.createElement('button');
    homeButton.id = 'homeButton';
    homeButton.className = 'home-btn';

    const homeIcon = document.createElement('img');
    homeIcon.src = '/static/images/home.svg';
    homeIcon.alt = 'Home';
    homeButton.appendChild(homeIcon);

    // Insert as first child of album-header.
    const headerContainer = document.getElementById('album-header');
    headerContainer.insertBefore(homeButton, headerContainer.firstChild);
  }
  homeButton.addEventListener('click', () => {
    window.location.href = window.location.origin;
  });

  // Check if any track in the album is explicit when filter is enabled
  let hasExplicitTrack = false;
  if (isExplicitFilterEnabled && album.tracks?.items) {
    hasExplicitTrack = album.tracks.items.some(track => track && track.explicit);
  }

  // Create (if needed) the Download Album Button.
  let downloadAlbumBtn = document.getElementById('downloadAlbumBtn');
  if (!downloadAlbumBtn) {
    downloadAlbumBtn = document.createElement('button');
    downloadAlbumBtn.id = 'downloadAlbumBtn';
    downloadAlbumBtn.textContent = 'Download Full Album';
    downloadAlbumBtn.className = 'download-btn download-btn--main';
    document.getElementById('album-header').appendChild(downloadAlbumBtn);
  }
  
  if (isExplicitFilterEnabled && hasExplicitTrack) {
    // Disable the album download button and display a message explaining why
    downloadAlbumBtn.disabled = true;
    downloadAlbumBtn.classList.add('download-btn--disabled');
    downloadAlbumBtn.innerHTML = `<span title="Cannot download entire album because it contains explicit tracks">Album Contains Explicit Tracks</span>`;
  } else {
    // Normal behavior when no explicit tracks are present
    downloadAlbumBtn.addEventListener('click', () => {
      // Remove any other download buttons (keeping the full-album button in place).
      document.querySelectorAll('.download-btn').forEach(btn => {
        if (btn.id !== 'downloadAlbumBtn') btn.remove();
      });

      downloadAlbumBtn.disabled = true;
      downloadAlbumBtn.textContent = 'Queueing...';

      downloadWholeAlbum(album)
        .then(() => {
          downloadAlbumBtn.textContent = 'Queued!';
        })
        .catch(err => {
          showError('Failed to queue album download: ' + (err?.message || 'Unknown error'));
          downloadAlbumBtn.disabled = false;
        });
    });
  }

  // Render each track.
  const tracksList = document.getElementById('tracks-list');
  tracksList.innerHTML = '';

  if (album.tracks?.items) {
    album.tracks.items.forEach((track, index) => {
      if (!track) return; // Skip null or undefined tracks
      
      // Skip explicit tracks if filter is enabled
      if (isExplicitFilterEnabled && track.explicit) {
        // Add a placeholder for filtered explicit tracks
        const trackElement = document.createElement('div');
        trackElement.className = 'track track-filtered';
        trackElement.innerHTML = `
          <div class="track-number">${index + 1}</div>
          <div class="track-info">
            <div class="track-name explicit-filtered">Explicit Content Filtered</div>
            <div class="track-artist">This track is not shown due to explicit content filter settings</div>
          </div>
          <div class="track-duration">--:--</div>
        `;
        tracksList.appendChild(trackElement);
        return;
      }
      
      const trackElement = document.createElement('div');
      trackElement.className = 'track';
      trackElement.innerHTML = `
        <div class="track-number">${index + 1}</div>
        <div class="track-info">
          <div class="track-name">
            <a href="${baseUrl}/track/${track.id || ''}">${track.name || 'Unknown Track'}</a>
          </div>
          <div class="track-artist">
            ${track.artists?.map(a => 
              `<a href="${baseUrl}/artist/${a?.id || ''}">${a?.name || 'Unknown Artist'}</a>`
            ).join(', ') || 'Unknown Artist'}
          </div>
        </div>
        <div class="track-duration">${msToTime(track.duration_ms || 0)}</div>
        <button class="download-btn download-btn--circle" 
                data-url="${track.external_urls?.spotify || ''}" 
                data-type="track"
                data-name="${track.name || 'Unknown Track'}"
                title="Download">
          <img src="/static/images/download.svg" alt="Download">
        </button>
      `;
      tracksList.appendChild(trackElement);
    });
  }

  // Reveal header and track list.
  document.getElementById('album-header').classList.remove('hidden');
  document.getElementById('tracks-container').classList.remove('hidden');
  attachDownloadListeners();

  // If on a small screen, re-arrange the action buttons.
  if (window.innerWidth <= 480) {
    let actionsContainer = document.getElementById('album-actions');
    if (!actionsContainer) {
      actionsContainer = document.createElement('div');
      actionsContainer.id = 'album-actions';
      document.getElementById('album-header').appendChild(actionsContainer);
    }
    // Append in the desired order: Home, Download, then Queue Toggle (if exists).
    actionsContainer.innerHTML = ''; // Clear any previous content
    actionsContainer.appendChild(document.getElementById('homeButton'));
    actionsContainer.appendChild(document.getElementById('downloadAlbumBtn'));
    const queueToggle = document.querySelector('.queue-toggle');
    if (queueToggle) {
      actionsContainer.appendChild(queueToggle);
    }
  }
}

async function downloadWholeAlbum(album) {
  const url = album.external_urls?.spotify || '';
  if (!url) {
    throw new Error('Missing album URL');
  }
  
  try {
    // Use the centralized downloadQueue.download method
    await downloadQueue.download(url, 'album', { name: album.name || 'Unknown Album' });
    // Make the queue visible after queueing
    downloadQueue.toggleVisibility(true);
  } catch (error) {
    showError('Album download failed: ' + (error?.message || 'Unknown error'));
    throw error;
  }
}

function msToTime(duration) {
  const minutes = Math.floor(duration / 60000);
  const seconds = ((duration % 60000) / 1000).toFixed(0);
  return `${minutes}:${seconds.padStart(2, '0')}`;
}

function showError(message) {
  const errorEl = document.getElementById('error');
  errorEl.textContent = message || 'An error occurred';
  errorEl.classList.remove('hidden');
}

function attachDownloadListeners() {
  document.querySelectorAll('.download-btn').forEach((btn) => {
    if (btn.id === 'downloadAlbumBtn') return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = e.currentTarget.dataset.url || '';
      const type = e.currentTarget.dataset.type || '';
      const name = e.currentTarget.dataset.name || extractName(url) || 'Unknown';
      // Remove the button immediately after click.
      e.currentTarget.remove();
      startDownload(url, type, { name });
    });
  });
}

async function startDownload(url, type, item, albumType) {
  if (!url) {
    showError('Missing URL for download');
    return;
  }
  
  try {
    // Use the centralized downloadQueue.download method
    await downloadQueue.download(url, type, item, albumType);
    
    // Make the queue visible after queueing
    downloadQueue.toggleVisibility(true);
  } catch (error) {
    showError('Download failed: ' + (error?.message || 'Unknown error'));
    throw error;
  }
}

function extractName(url) {
  return url || 'Unknown';
}
